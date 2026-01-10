package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

type OptimizedSession struct {
	SingleCode  string
	ClusterCode string
}

var (
	sessionStore = make(map[string]OptimizedSession)
	storeMutex   sync.Mutex
	sessionID    = "default-user"
)

type CodeRequest struct {
	Input string `json:"input"`
}

func getAIClient(ctx context.Context) (*genai.Client, error) {
	apiKey := "AIzaSyBFlYZs92YYa3SHG8kijw2hlq5EZcftVBc"
	return genai.NewClient(ctx, option.WithAPIKey(apiKey))
}

func generateCodes(ctx context.Context, input string) (string, string, error) {
	client, err := getAIClient(ctx)
	if err != nil {
		return "", "", err
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-3-flash-preview")
	prompt := fmt.Sprintf(`
[ROLE] 
Expert in High-Performance Computing (HPC) and Python MPI Optimization.

[TASK] 
Analyze the User Input and generate TWO separate Python versions:
1. VERSION 1: SINGLE CORE (Sequential using NumPy/SciPy).
2. VERSION 2: CLUSTER (MPI Parallelized using Master-Worker Architecture).

[ADAPTIVE LOGIC]
- If the task is OPTIMIZATION: Use 'L-BFGS-B' and parallelize the Gradient/Objective.
- If the task is MATRIX/LINEAR ALGEBRA: Use Row-wise decomposition with 'comm.Scatter' and 'comm.Gather'.
- If the task is GENERAL COMPUTATION: Divide the data range/workload equally among MPI ranks.

[STRICT ARCHITECTURE RULES]
1. CONSISTENCY: Both versions must use the same algorithm and np.random.seed(42).
2. THREAD CONTROL: Both versions MUST have 'os.environ["OMP_NUM_THREADS"] = "1"' at the start.
3. MPI MASTER-WORKER (CRITICAL):
   - Use a SINGLE tuple bcast: 'data = comm.bcast((task_id, payload), root=0)' for synchronization.
   - Task IDs: 1 (Work), 0 (Stop).
   - Use high-performance MPI calls: 'comm.Gatherv' or 'comm.Reduce' depending on the task.
4. FORMAT: Separate the two versions with EXACTLY "===CLUSTER_VERSION_START===".

[OUTPUT]
Both versions MUST end with:
print(f"Result: {final_result_value}")
print(f"Time taken: {duration} seconds")

[STRICT] Return ONLY raw Python code. Start with 'import sys, time, numpy as np, os'.

User Input/Task: %s
`, input)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return "", "", err
	}

	var fullText string
	if len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
		for _, part := range resp.Candidates[0].Content.Parts {
			fullText += fmt.Sprintf("%v", part)
		}
	}

	fullText = strings.ReplaceAll(fullText, "```python", "")
	fullText = strings.ReplaceAll(fullText, "```", "")

	parts := strings.Split(fullText, "===CLUSTER_VERSION_START===")
	if len(parts) < 2 {
		return "", "", fmt.Errorf("AI failed to provide two distinct versions.")
	}

	return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]), nil
}

func main() {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.POST("/api/optimize", func(c *gin.Context) {
		var req CodeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "Invalid input"})
			return
		}
		sCode, cCode, err := generateCodes(context.Background(), req.Input)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		storeMutex.Lock()
		sessionStore[sessionID] = OptimizedSession{SingleCode: sCode, ClusterCode: cCode}
		storeMutex.Unlock()
		c.JSON(200, gin.H{"status": "optimized", "optimized_code": cCode})
	})

	r.POST("/api/run/single", func(c *gin.Context) {
		storeMutex.Lock()
		session, _ := sessionStore[sessionID]
		storeMutex.Unlock()
		os.WriteFile("temp_single.py", []byte(session.SingleCode), 0644)
		out, err := exec.Command("python", "temp_single.py").CombinedOutput()
		status := "success"
		if err != nil {
			status = "error"
		}
		c.JSON(200, gin.H{"output": string(out), "status": status})
	})

	r.POST("/api/run/cluster", func(c *gin.Context) {
		storeMutex.Lock()
		session, _ := sessionStore[sessionID]
		storeMutex.Unlock()
		os.WriteFile("temp_cluster.py", []byte(session.ClusterCode), 0644)
		mpiPath := `C:\Program Files\Microsoft MPI\Bin\mpiexec.exe`
		out, err := exec.Command(mpiPath, "-n", "4", "python", "temp_cluster.py").CombinedOutput()
		status := "success"
		if err != nil {
			status = "error"
		}
		c.JSON(200, gin.H{"output": string(out), "status": status})
	})

	r.Run(":8080")
}
