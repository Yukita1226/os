import sys, time, numpy as np, os
from mpi4py import MPI

# VERSION 2: CLUSTER (MPI Parallelized - Master-Worker Architecture)
os.environ["OMP_NUM_THREADS"] = "1"

comm = MPI.COMM_WORLD
rank = comm.Get_rank()
size = comm.Get_size()

N = 10000
np.random.seed(42)

# Master-Worker Control Signal: Task ID 1 = Work, 0 = Stop
if rank == 0:
    # Master generates data
    A = np.random.rand(N, N).astype(np.float64)
    B = np.random.rand(N, N).astype(np.float64)
    start_time = time.time()
    # Synchronization and Task Assignment
    data = comm.bcast((1, N), root=0)
else:
    A = None
    B = np.empty((N, N), dtype=np.float64)
    # Receive Task ID and payload
    data = comm.bcast(None, root=0)
    task_id, payload = data
    if task_id == 0:
        sys.exit(0)

# 1. High-Performance Broadcast of Matrix B to all workers
comm.Bcast(B, root=0)

# 2. Row-wise decomposition for A
rows_per_rank = N // size
remainder = N % size
sendcounts = np.array([rows_per_rank + (1 if i < remainder else 0) for i in range(size)])
displacements = np.array([sum(sendcounts[:i]) for i in range(size)])

# 3. Scatter Matrix A (High-performance Scatterv)
local_A = np.empty((sendcounts[rank], N), dtype=np.float64)
comm.Scatterv([A, sendcounts * N, displacements * N, MPI.DOUBLE], local_A, root=0)

# 4. Local Matrix Multiplication
local_C = np.dot(local_A, B)

# 5. Gather results (High-performance Gatherv)
if rank == 0:
    C = np.empty((N, N), dtype=np.float64)
else:
    C = None

comm.Gatherv(local_C, [C, sendcounts * N, displacements * N, MPI.DOUBLE], root=0)

if rank == 0:
    duration = time.time() - start_time
    final_result_value = np.sum(C)
    # Send stop signal
    comm.bcast((0, None), root=0)
    print(f"Result: {final_result_value}")
    print(f"Time taken: {duration} seconds")
else:
    # Receive final synchronization
    comm.bcast(None, root=0)