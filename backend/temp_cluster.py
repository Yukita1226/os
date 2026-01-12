import os
os.environ["OMP_NUM_THREADS"] = "1"
import sys
import time
import numpy as np
from mpi4py import MPI

# MPI Setup
comm = MPI.COMM_WORLD
rank = comm.Get_rank()
size = comm.Get_size()

# Configuration
N_total = 120000
K = 4
T = 50
M = size
n_local = N_total // M

# Step 1: Initialization
# Each rank generates its own unique subset of data
np.random.seed(42 + rank)
local_X = np.random.rand(n_local, 2)

centroids = np.zeros((K, 2))

if rank == 0:
    # Rank 0 selects initial centroids
    indices = np.random.choice(n_local, K, replace=False)
    centroids = local_X[indices]

# Broadcast initial centroids to all ranks
centroids = comm.bcast(centroids, root=0)

comm.Barrier()
start_time = time.time()

# Step 2: Main Iteration Loop
for t in range(T):
    # Assignment Step
    # Calculate distances for local data
    # (n_local, 1, 2) - (K, 2) -> (n_local, K, 2)
    diff = local_X[:, np.newaxis, :] - centroids
    dist_sq = np.sum(diff**2, axis=2)
    local_labels = np.argmin(dist_sq, axis=1)
    
    # Local Aggregation
    local_sums = np.zeros((K, 2))
    local_counts = np.zeros(K)
    
    for k in range(K):
        mask = (local_labels == k)
        if np.any(mask):
            local_sums[k] = np.sum(local_X[mask], axis=0)
            local_counts[k] = np.sum(mask)
            
    # Global Reduction
    total_sums = np.zeros((K, 2))
    total_counts = np.zeros(K)
    
    comm.Allreduce(local_sums, total_sums, op=MPI.SUM)
    comm.Allreduce(local_counts, total_counts, op=MPI.SUM)
    
    # Update Step
    for k in range(K):
        if total_counts[k] > 0:
            centroids[k] = total_sums[k] / total_counts[k]

comm.Barrier()
duration = time.time() - start_time

# Step 3: Finalization
if rank == 0:
    final_result_value = centroids
    print(f"Result: {final_result_value}")
    print(f"Time taken: {duration} seconds")