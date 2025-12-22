import time
from mpi4py import MPI

def is_prime(n):
    if n < 2: return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0: return False
    return True

# Initialize MPI
comm = MPI.COMM_WORLD
rank = comm.Get_rank()
size = comm.Get_size()

def count_primes_distributed(limit, rank, size):
    local_count = 0
    # Each process checks numbers 'i' such that 'i % size == rank'
    # This distributes the workload across processes by stepping 'size'
    # starting from 'rank'.
    for i in range(rank, limit, size):
        if is_prime(i):
            local_count += 1
    return local_count

# Start timing only on the root process for overall measurement
if rank == 0:
    start_time = time.time()

# Each process computes its local share of primes
LIMIT = 1000000
local_found = count_primes_distributed(LIMIT, rank, size)

# Gather all local_found counts to the root process (rank 0) and sum them
# MPI.SUM is a predefined operation for reduction
total_found = comm.reduce(local_found, op=MPI.SUM, root=0)

if rank == 0:
    end_time = time.time()
    print(f"Result: Found {total_found} primes")
    print(f"Time taken: {end_time - start_time:.2f} seconds")