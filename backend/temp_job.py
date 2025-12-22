from mpi4py import MPI
import numpy as np
import time

comm = MPI.COMM_WORLD
rank = comm.Get_rank()
size = comm.Get_size()

# Total number of elements: 5000 down to 0, inclusive, so 5001 elements.
total_elements = 5001

# Calculate sendcounts and displs for Scatterv and Gatherv
# These need to be consistent across all processes for proper communication setup.
avg_chunk_size = total_elements // size
remainder = total_elements % size

sendcounts = np.array([avg_chunk_size + 1 if i < remainder else avg_chunk_size for i in range(size)], dtype=np.int32)
displs = np.array([sum(sendcounts[:i]) for i in range(size)], dtype=np.int32)

# Determine the size of the local chunk for this process
my_chunk_size = sendcounts[rank]
local_chunk = np.empty(my_chunk_size, dtype=np.int32)

if rank == 0:
    # Generate data on the root process (worst case: descending order)
    data = np.array(list(range(total_elements - 1, -1, -1)), dtype=np.int32)
    
    # Scatter the data to all processes
    # sendbuf: [data, sendcounts, displs, datatype]
    # recvbuf: [receive_buffer, count, datatype]
    comm.Scatterv([data, sendcounts, displs, MPI.INT], [local_chunk, my_chunk_size, MPI.INT])
    
    start_time = time.time() # Start timer after data distribution

else:
    # Other processes receive their chunk
    # sendbuf is None for non-root processes
    comm.Scatterv(None, [local_chunk, my_chunk_size, MPI.INT])

# Step 1: Each process sorts its local chunk initially
local_chunk.sort()

# Odd-Even Transposition Sort for blocks
# The algorithm performs 'size' phases to guarantee full sorting across all processes.
for phase in range(size):
    if phase % 2 == 0: # Even phase: pairs (0,1), (2,3), ...
        if rank % 2 == 0: # I am an even rank
            partner = rank + 1
            if partner < size: # Check if partner exists
                # Determine partner's chunk size
                partner_chunk_size = sendcounts[partner]
                recv_buffer = np.empty(partner_chunk_size, dtype=np.int32)
                
                # Exchange chunks with partner
                comm.Sendrecv(local_chunk, dest=partner, recvbuf=recv_buffer, source=partner)
                
                # Merge and split: I am the "left" process in this pair
                # I keep the smaller half of the merged data
                merged = np.concatenate((local_chunk, recv_buffer))
                merged.sort()
                local_chunk = merged[:my_chunk_size].copy() # Ensure contiguous array after slicing
        else: # I am an odd rank
            partner = rank - 1
            if partner >= 0: # Check if partner exists
                # Determine partner's chunk size
                partner_chunk_size = sendcounts[partner]
                recv_buffer = np.empty(partner_chunk_size, dtype=np.int32)
                
                # Exchange chunks with partner
                comm.Sendrecv(local_chunk, dest=partner, recvbuf=recv_buffer, source=partner)
                
                # Merge and split: I am the "right" process in this pair
                # I keep the larger half of the merged data
                merged = np.concatenate((recv_buffer, local_chunk))
                merged.sort()
                local_chunk = merged[-my_chunk_size:].copy() # Ensure contiguous array after slicing

    else: # Odd phase: pairs (1,2), (3,4), ...
        if rank % 2 == 1: # I am an odd rank
            partner = rank + 1
            if partner < size: # Check if partner exists
                # Determine partner's chunk size
                partner_chunk_size = sendcounts[partner]
                recv_buffer = np.empty(partner_chunk_size, dtype=np.int32)
                
                # Exchange chunks with partner
                comm.Sendrecv(local_chunk, dest=partner, recvbuf=recv_buffer, source=partner)
                
                # Merge and split: I am the "left" process in this pair
                # I keep the smaller half of the merged data
                merged = np.concatenate((local_chunk, recv_buffer))
                merged.sort()
                local_chunk = merged[:my_chunk_size].copy() # Ensure contiguous array after slicing
        else: # I am an even rank
            partner = rank - 1
            if partner >= 0: # Check if partner exists
                # Determine partner's chunk size
                partner_chunk_size = sendcounts[partner]
                recv_buffer = np.empty(partner_chunk_size, dtype=np.int32)
                
                # Exchange chunks with partner
                comm.Sendrecv(local_chunk, dest=partner, recvbuf=recv_buffer, source=partner)
                
                # Merge and split: I am the "right" process in this pair
                # I keep the larger half of the merged data
                merged = np.concatenate((recv_buffer, local_chunk))
                merged.sort()
                local_chunk = merged[-my_chunk_size:].copy() # Ensure contiguous array after slicing

# Gather all sorted chunks back to the root process (rank 0)
if rank == 0:
    sorted_data_buffer = np.empty(total_elements, dtype=np.int32)
    # recvbuf on root: [receive_buffer, recvcounts, rdispls, datatype]
    comm.Gatherv([local_chunk, my_chunk_size, MPI.INT], [sorted_data_buffer, sendcounts, displs, MPI.INT])
    end_time = time.time()
    
    # Display results
    target_idx = 1000
    if len(sorted_data_buffer) > target_idx:
        target_val = sorted_data_buffer[target_idx]
    else:
        target_val = "N/A"

    print(f"Result: Value at index {target_idx} is {target_val}")
    print(f"Time taken: {end_time - start_time:.2f} seconds")
else:
    # Non-root processes send their local_chunk
    # sendbuf: [send_buffer, count, datatype]
    # recvbuf is None for non-root processes
    comm.Gatherv([local_chunk, my_chunk_size, MPI.INT], None)