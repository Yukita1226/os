import time

def is_prime(n):
    if n < 2: return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0: return False
    return True

def count_primes(limit):
    return sum(1 for i in range(limit) if is_prime(i))

start = time.time()
found = count_primes(1000000) # หาจำนวนเลขเฉพาะในช่วง 1 ล้าน
print(f"Result: Found {found} primes")
print(f"Time taken: {time.time() - start:.2f} seconds")