import numpy as np
import sys
import time
from mpi4py import MPI

# Initialize MPI
comm = MPI.COMM_WORLD
rank = comm.Get_rank()
size = comm.Get_size()
dtype = np.int32 # Data type for all communications

# Define total number of elements
limit = 50000 
N = limit + 1

# CRITICAL ANALYSIS RULE check
# The target algorithm is "Parallel Odd-Even Merge-Split Sort", which is suitable for parallelism.
# N = 50,001 is much greater than 1,000. So, no "NOTIFICATION" is needed.

if rank == 0:
    # Generate initial unsorted data on root
    root_data = np.array(list(range(limit, -1, -1)), dtype=dtype)
    start_time = MPI.Wtime()
else:
    root_data = None
    start_time = None

# Calculate sendcounts and displs on all ranks
# sendcounts[i] is the number of elements rank i will receive
sendcounts = np.array([N // size + (1 if i < N % size else 0) for i in range(size)], dtype=dtype)
# displs[i] is the displacement (offset) from the beginning of sendbuf for rank i
displs = np.array([sum(sendcounts[:i]) for i in range(size)], dtype=dtype)

# Allocate local chunk for each process
local_chunk_size = sendcounts[rank]
local_chunk = np.empty(local_chunk_size, dtype=dtype)

# Scatter the data to all processes
comm.Scatterv([root_data, sendcounts, displs, MPI.INT], [local_chunk, MPI.INT], root=0)

# Each process sorts its local chunk initially
local_chunk.sort()

# Parallel Odd-Even Merge-Split Sort
for phase in range(size): # 'size' phases as per sorting logic rule
    partner = MPI.PROC_NULL # Initialize partner to an invalid rank

    if phase % 2 == 0: # Even phase
        if rank % 2 == 0: # Even rank
            partner = rank + 1
        else: # Odd rank
            partner = rank - 1
    else: # Odd phase
        if rank % 2 == 0: # Even rank
            partner = rank - 1
        else: # Odd rank
            partner = rank + 1

    # Check if partner is valid and within bounds
    if 0 <= partner < size:
        # Determine the partner's chunk size to allocate received_chunk correctly
        partner_chunk_size = sendcounts[partner]
        received_chunk = np.empty(partner_chunk_size, dtype=dtype)

        # Exchange chunks with partner using Sendrecv
        comm.Sendrecv(sendbuf=[local_chunk, MPI.INT], dest=partner,
                      recvbuf=[received_chunk, MPI.INT], source=partner)

        # Merge the two sorted chunks
        merged = np.concatenate((local_chunk, received_chunk))
        merged.sort()

        # Split the merged chunk
        # Lower rank keeps the smaller half, Higher rank keeps the larger half
        if rank < partner:
            local_chunk = merged[:local_chunk_size].copy() # .copy() for contiguous memory
        else: # rank > partner
            local_chunk = merged[partner_chunk_size:].copy() # .copy() for contiguous memory
    
    comm.Barrier() # Sync after each Odd-Even phase

# Gather all sorted chunks back to root process
if rank == 0:
    sorted_data = np.empty(N, dtype=dtype)
    comm.Gatherv([local_chunk, MPI.INT], [sorted_data, sendcounts, displs, MPI.INT], root=0)
    end_time = MPI.Wtime()

    print(f"CRITICAL TEST: Sorting {N} elements with Parallel Odd-Even Merge-Split Sort...")
    
    target_idx = 1000
    print(f"Result: Value at index {target_idx} is {sorted_data[target_idx]}")
    print(f"Time taken: {end_time - start_time:.2f} seconds")
else:
    comm.Gatherv([local_chunk, MPI.INT], None, root=0) # Non-root processes send their data