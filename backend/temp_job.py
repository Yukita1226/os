import sys
import time
import numpy as np
from mpi4py import MPI

comm = MPI.COMM_WORLD
rank = comm.Get_rank()
size = comm.Get_size()

if rank == 0:
    limit = 50000
    data = np.array(list(range(limit, -1, -1)), dtype=np.int32)
    N = len(data)
else:
    N = None
    data = None

N = comm.bcast(N, root=0)

if N < 1000:
    if rank == 0:
        print("NOTIFICATION: Input size N is less than 1000, parallelization is inefficient.")
    sys.exit()

sendcounts = np.array([N // size + (1 if i < N % size else 0) for i in range(size)], dtype=np.int32)
displs = np.array([sum(sendcounts[:i]) for i in range(size)], dtype=np.int32)

local_count = sendcounts[rank]
local_chunk = np.empty(local_count, dtype=np.int32)

if rank == 0:
    start_time = MPI.Wtime()

comm.Scatterv([data, sendcounts, displs, MPI.INT], local_chunk, root=0)

local_chunk.sort()

# Odd-Even Transposition Sort for blocks
for phase in range(size):
    partner = MPI.PROC_NULL
    
    # Determine partner for current phase
    if phase % 2 == 0: # Even phase: (0,1), (2,3), ...
        if rank % 2 == 0: # Even rank pairs with rank+1
            if rank + 1 < size:
                partner = rank + 1
        else: # Odd rank pairs with rank-1
            partner = rank - 1 
    else: # Odd phase: (1,2), (3,4), ...
        if rank % 2 != 0: # Odd rank pairs with rank+1
            if rank + 1 < size:
                partner = rank + 1
        else: # Even rank pairs with rank-1
            partner = rank - 1 
            
    if partner != MPI.PROC_NULL and 0 <= partner < size:
        partner_chunk_size = sendcounts[partner]
        received_chunk = np.empty(partner_chunk_size, dtype=np.int32)
        
        comm.Sendrecv(local_chunk, dest=partner, sendtag=0,
                      recvbuf=received_chunk, source=partner, recvtag=0)

        merged_array = np.concatenate((local_chunk, received_chunk))
        merged_array.sort()

        if rank < partner: 
            # Lower rank keeps the smallest `local_count` elements
            local_chunk = merged_array[:local_count].copy()
        else: 
            # Higher rank keeps the largest `local_count` elements
            local_chunk = merged_array[len(merged_array) - local_count:].copy()

target_idx = 1000
result_value_at_idx = np.empty(1, dtype=np.int32)

target_rank_for_idx = -1
local_target_idx = -1

# Calculate which rank owns target_idx
current_global_idx_offset = 0
for i in range(size):
    if target_idx < current_global_idx_offset + sendcounts[i]:
        target_rank_for_idx = i
        local_target_idx = target_idx - current_global_idx_offset
        break
    current_global_idx_offset += sendcounts[i]

if rank == target_rank_for_idx:
    result_value_at_idx[0] = local_chunk[local_target_idx]
    if rank != 0:
        comm.Send(result_value_at_idx, dest=0, tag=1)
elif rank == 0:
    if target_rank_for_idx != 0:
        comm.Recv(result_value_at_idx, source=target_rank_for_idx, tag=1)

comm.Barrier()

if rank == 0:
    end_time = MPI.Wtime()
    print(f"CRITICAL TEST: Sorting {N} elements with Parallel Odd-Even Merge-Split Sort...")
    print(f"Result: Value at index {target_idx} is {result_value_at_idx[0]}")
    print(f"Time taken: {end_time - start_time:.2f} seconds")