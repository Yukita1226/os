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
    Target: Convert Python code to use 'mpi4py' for a distributed cluster or analyze its suitability.
    Context: Windows with MS-MPI, 4 Cores.
    
    [CRITICAL ANALYSIS RULE]
    Analyze if the input code is suitable for parallel processing.
    If the code has high sequential dependency or the workload is too trivial (e.g., N < 1000):
    - Return a script that ONLY prints a notification: print("NOTIFICATION: [Reason why not suitable]")
    - DO NOT parallelize if it will be slower than single-core.

    [CONVERSION RULES - If suitable]
    - MODULE: Use exactly 'from mpi4py import MPI'. NEVER use 'mpi44py'.
    - LIBRARIES: Include 'import numpy as np', 'import sys', and 'import time'.
    - DATA TYPE: Always use 'dtype=np.int32' for ALL NumPy arrays to match 'MPI.INT'.
    - SCATTER/GATHER: Use CAPITALIZED 'comm.Scatterv' and 'comm.Gatherv'.
    - SENDRECV: Use CAPITALIZED 'comm.Sendrecv' for data exchange.
    
    [SORTING LOGIC - STRATEGIC]
    - ALGORITHM: Implement "Parallel Odd-Even Merge-Split Sort".
    - STEP 1: Initial local sort using 'local_chunk.sort()'.
    - STEP 2: In each of the 'size' phases, partners MUST exchange their ENTIRE local chunks.
    - STEP 3: Both processes must 'np.concatenate' their data with received data, then 'np.sort' the combined array.
    - STEP 4: Lower rank keeps the first half (smaller), Higher rank keeps the second half (larger).
    - SLICING: Always use '.copy()' after slicing (e.g., local_chunk = merged[:n].copy()) to ensure contiguous memory.

    - OUTPUT: Return ONLY raw Python code. No markdown, no explanations.

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
