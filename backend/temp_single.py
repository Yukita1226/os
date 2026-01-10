import sys, time, numpy as np, os

# VERSION 1: SINGLE CORE (Sequential)
os.environ["OMP_NUM_THREADS"] = "1"

N = 10000
np.random.seed(42)

# Algorithm Implementation
A = np.random.rand(N, N)
B = np.random.rand(N, N)

start_time = time.time()

# Matrix Multiplication using standard NumPy dot product
result = np.dot(A, B)

duration = time.time() - start_time
final_result_value = np.sum(result)

print(f"Result: {final_result_value}")
print(f"Time taken: {duration} seconds")