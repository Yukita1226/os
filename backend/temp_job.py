from mpi4py import MPI
import numpy as np
import sys
import time

# CRITICAL ANALYSIS:
# The original code performs a bubble sort on 20,001 integer elements.
# Bubble sort is an O(N^2) algorithm, making it very inefficient for larger datasets.
# Sorting is a well-known problem that can significantly benefit from parallel processing.
# The dataset size (20,001 elements) is sufficient for a 4-core system to potentially see speedup,
# especially given the high computational complexity of the original algorithm.
# The prompt explicitly requests the implementation of 'Pure Parallel Odd-Even Transposition Sort'
# for sorting tasks, which is a suitable algorithm for distributed memory parallelization.
# Therefore, this code is suitable for parallel conversion.

comm = MPI.COMM_WORLD
rank = comm.Get_rank()
size = comm.Get_size()

limit = 20000
N = limit + 1 # Total number of elements (from 0 to 20000, inclusive)

start_time = 0

# Calculate sendcounts and displacements for Scatterv and Gatherv
# These arrays define how many elements each process sends/receives and from what offset.
sendcounts = np.array([N // size + (1 if i < N % size else 0) for i in range(size)], dtype=np.int32)
displs = np.array([sum(sendcounts[:i]) for i in range(size)], dtype=np.int32)

local_count = sendcounts[rank]
local_data = np.empty(local_count, dtype=np.int32)

if rank == 0:
    # Prepare the initial data (reversed order) on the root process
    root_data = np.array(list(range(limit, -1, -1)), dtype=np.int32)
    print(f"CRITICAL TEST: Sorting {len(root_data)} elements with Pure Parallel Odd-Even Transposition Sort...")
    start_time = time.time()
else:
    root_data = None

# Scatter the data from the root process to all other processes
# Each process receives its designated chunk of data into 'local_data'.
comm.Scatterv([root_data, sendcounts, displs, MPI.INT], local_data)

# Each process sorts its local chunk of data independently
local_data.sort()

# Perform Odd-Even Transposition Sort phases
# The algorithm performs 'size' phases to guarantee that the data is fully sorted.
for phase in range(size):
    # Odd-indexed comparison phase: Processes (1,2), (3,4), etc. compare and exchange
    if phase % 2 == 1:
        # Odd-ranked processes exchange with their right neighbor
        # They send their current 'local_data' and receive the neighbor's data.
        # After merging, they keep the smaller half of the combined data.
        if rank % 2 == 1 and rank + 1 < size:
            neighbor = rank + 1
            neighbor_count = sendcounts[neighbor]
            recv_buffer = np.empty(neighbor_count, dtype=np.int32)
            
            comm.Sendrecv(sendbuf=[local_data, MPI.INT], dest=neighbor,
                          recvbuf=[recv_buffer, MPI.INT], source=neighbor)
            
            merged = np.concatenate((local_data, recv_buffer))
            merged.sort()
            local_data = merged[:local_count]
        # Even-ranked processes exchange with their left neighbor
        # They send their current 'local_data' and receive the neighbor's data.
        # After merging, they keep the larger half of the combined data.
        elif rank % 2 == 0 and rank > 0:
            neighbor = rank - 1
            neighbor_count = sendcounts[neighbor]
            recv_buffer = np.empty(neighbor_count, dtype=np.int32)
            
            comm.Sendrecv(sendbuf=[local_data, MPI.INT], dest=neighbor,
                          recvbuf=[recv_buffer, MPI.INT], source=neighbor)
            
            merged = np.concatenate((recv_buffer, local_data)) # Neighbor's data comes first for 'larger half' logic
            merged.sort()
            local_data = merged[local_count:]
            
    # Even-indexed comparison phase: Processes (0,1), (2,3), etc. compare and exchange
    else: # phase % 2 == 0
        # Even-ranked processes exchange with their right neighbor
        # They send their current 'local_data' and receive the neighbor's data.
        # After merging, they keep the smaller half of the combined data.
        if rank % 2 == 0 and rank + 1 < size:
            neighbor = rank + 1
            neighbor_count = sendcounts[neighbor]
            recv_buffer = np.empty(neighbor_count, dtype=np.int32)
            
            comm.Sendrecv(sendbuf=[local_data, MPI.INT], dest=neighbor,
                          recvbuf=[recv_buffer, MPI.INT], source=neighbor)
            
            merged = np.concatenate((local_data, recv_buffer))
            merged.sort()
            local_data = merged[:local_count]
        # Odd-ranked processes exchange with their left neighbor
        # They send their current 'local_data' and receive the neighbor's data.
        # After merging, they keep the larger half of the combined data.
        elif rank % 2 == 1 and rank > 0:
            neighbor = rank - 1
            neighbor_count = sendcounts[neighbor]
            recv_buffer = np.empty(neighbor_count, dtype=np.int32)
            
            comm.Sendrecv(sendbuf=[local_data, MPI.INT], dest=neighbor,
                          recvbuf=[recv_buffer, MPI.INT], source=neighbor)
            
            merged = np.concatenate((recv_buffer, local_data))
            merged.sort()
            local_data = merged[local_count:]

# Gather all sorted chunks back to the root process (rank 0)
if rank == 0:
    gathered_data = np.empty(N, dtype=np.int32)
else:
    gathered_data = None

comm.Gatherv(sendbuf=[local_data, MPI.INT],
             recvbuf=[gathered_data, sendcounts, displs, MPI.INT],
             root=0)

if rank == 0:
    end_time = time.time()
    
    target_idx = 1000
    print(f"Result: Value at index {target_idx} is {gathered_data[target_idx]}")
    print(f"Time taken: {end_time - start_time:.2f} seconds")
    
    # Verification to ensure the data is correctly sorted
    expected_data = np.arange(N, dtype=np.int32)
    if np.array_equal(gathered_data, expected_data):
        print("Verification: Data sorted correctly.")
    else:
        print("Verification: Data NOT sorted correctly.")
        # Optional: Print first few differing elements for debugging
        # diff_indices = np.where(gathered_data != expected_data)[0]
        # if diff_indices.size > 0:
        #     print(f"First mismatch at index {diff_indices[0]}: Expected {expected_data[diff_indices[0]]}, Got {gathered_data[diff_indices[0]]}")