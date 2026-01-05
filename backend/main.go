package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

type DeployRequest struct {
	Code         string `json:"code"`
	Mode         string `json:"mode"`
	OnlyOptimize bool   `json:"onlyOptimize"`
}

func optimizeCodeWithAI(userCode string) (string, error) {
	ctx := context.Background()
	apiKey := "AIzaSyAVOc5Erzf9dA-Ehtmn8ZKg3JjSdg2sfCE"
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return "", err
	}
	defer client.Close()

	// พยายามใช้รุ่น Pro ก่อนเพื่อความแม่นยำ
	modelNames := []string{"gemini-1.5-pro", "gemini-2.5-flash"}

	prompt := fmt.Sprintf(`
Target: Convert Python code to use 'mpi4py' for a distributed cluster.
Context: Windows with MS-MPI, 4 Cores. Optimization for SPEEDUP is mandatory.

[CONSTRAINTS]
- Output: Return ONLY raw Python code. 
- Format: No markdown code blocks (no symbols like `+"```"+`), no explanations, no preamble.
- Start directly with 'import sys'.

[CRITICAL ANALYSIS RULE]
Analyze suitability. If N < 1000, print ONLY "NOTIFICATION: [Reason]" and exit via 'sys.exit()' for all ranks.

[CONVERSION RULES]
- MODULES: Use 'from mpi4py import MPI', 'import numpy as np', 'import sys', 'import time'.
- DATA TYPE: ALWAYS use 'dtype=np.int32' and 'MPI.INT' for all communications.
- WORK DISTRIBUTION: 
    sendcounts = np.array([N // size + (1 if i < N %% size else 0) for i in range(size)], dtype=np.int32)
    displs = np.array([sum(sendcounts[:i]) for i in range(size)], dtype=np.int32)

[STABILITY & PERFORMANCE RULES]
1. TIMING: Define 'start_time = MPI.Wtime()' on rank 0 IMMEDIATELY BEFORE 'comm.Scatterv'.
2. COLLECTIVES (SPEED OPTIMIZATION): 
   - Use 'comm.Scatterv' to distribute data.
   - For counting tasks, DO NOT use Gatherv for the entire array. 
   - Each rank must calculate its local result (e.g., local_sum) as a numpy array of size 1.
   - Use 'comm.Reduce(local_sum, global_sum, op=MPI.SUM, root=0)' to aggregate the final result.
3. VECTORIZATION: Encourage using NumPy vectorized operations inside the local processing logic to outperform standard Python loops.
4. SYNC: Use 'comm.Barrier()' before 'end_time = MPI.Wtime()' on rank 0.

[ALGORITHM: Parallel Odd-Even Merge-Split Sort]
(Use this ONLY if the input code is a sorting task)
- Initial 'local_chunk.sort()'.
- 'size' phases of exchange using 'comm.Sendrecv'.
- Lower rank keeps smaller half, higher rank keeps larger half.
- Use '.copy()' after slicing to ensure contiguous memory.

Input Code:
%s`, userCode)

	var lastErr error
	for _, mName := range modelNames {
		model := client.GenerativeModel(mName)
		resp, err := model.GenerateContent(ctx, genai.Text(prompt))
		if err != nil {
			lastErr = err
			continue
		}
		if len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
			if part, ok := resp.Candidates[0].Content.Parts[0].(genai.Text); ok {
				cleanCode := string(part)
				cleanCode = strings.ReplaceAll(cleanCode, "```python", "")
				cleanCode = strings.ReplaceAll(cleanCode, "```", "")
				return strings.TrimSpace(cleanCode), nil
			}
		}
	}
	return "", fmt.Errorf("AI Error: %v", lastErr)
}

func main() {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.POST("/deploy", func(c *gin.Context) {
		var req DeployRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "Bad Request"})
			return
		}

		if req.OnlyOptimize {
			optimizedCode, err := optimizeCodeWithAI(req.Code)
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, gin.H{"status": "success", "optimized_code": optimizedCode})
			return
		}

		var cmd *exec.Cmd
		var finalCode string = req.Code
		// ใช้ Absolute Path เพื่อความชัวร์บน Windows
		absPath, _ := filepath.Abs(".")
		tempFileName := filepath.Join(absPath, "temp_job.py")

		if req.Mode == "cluster" || req.Mode == "cluster_run_only" {
			if req.Mode == "cluster" {
				optimized, err := optimizeCodeWithAI(req.Code)
				if err != nil {
					c.JSON(500, gin.H{"error": err.Error()})
					return
				}
				finalCode = optimized
			}
		}

		os.WriteFile(tempFileName, []byte(finalCode), 0644)

		if req.Mode == "single" {
			cmd = exec.Command("python", tempFileName)
		} else {
			// ✅ กำหนด Full Path ของ mpiexec โดยตรง
			mpiPath := `C:\Program Files\Microsoft MPI\Bin\mpiexec.exe`

			// เช็คว่าไฟล์มีจริงไหม ถ้าไม่มีให้ลองใช้ชื่อปกติ
			if _, err := os.Stat(mpiPath); err == nil {
				cmd = exec.Command(mpiPath, "-n", "4", "python", tempFileName)
			} else {
				cmd = exec.Command("mpiexec", "-n", "4", "python", tempFileName)
			}
		}

		// ดึง Output และ Error
		out, err := cmd.CombinedOutput()
		outputStr := string(out)

		if err != nil {
			// กรณีรันไม่สำเร็จ ให้พ่น Error ออกไปดูว่าติดตรงไหน
			outputStr = fmt.Sprintf("❌ Error: %v\nOutput: %s", err, outputStr)
		}

		c.JSON(200, gin.H{
			"status":         "success",
			"mode":           req.Mode,
			"optimized_code": finalCode,
			"output":         outputStr,
		})
	})

	fmt.Println("🚀 Windows Simulator Backend ready on http://localhost:8080")
	r.Run(":8080")
}
