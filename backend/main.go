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
	nodes        = []string{"192.168.162.55", "192.168.162.56", "192.168.162.57"}
)

// ฟังก์ชันช่วยส่งไฟล์ไปยังทุก Node
func deployToCluster(filename string, content string) {
	os.WriteFile(filename, []byte(content), 0644)
	for _, node := range nodes {
		dest := fmt.Sprintf("pi@%s:/home/pi/pi_libs/", node)
		// ใช้ scp แบบ Background หรือเรียกแยกเพื่อความเร็ว
		exec.Command("scp", "-o", "StrictHostKeyChecking=no", filename, dest).Run()
	}
}

func getAIClient(ctx context.Context) (*genai.Client, error) {
	apiKey := "AIzaSyAVOc5Erzf9dA-Ehtmn8ZKg3JjSdg2sfCE"
	return genai.NewClient(ctx, option.WithAPIKey(apiKey))
}

func generateCodes(ctx context.Context, input string) (string, string, error) {
	client, err := getAIClient(ctx)
	if err != nil {
		return "", "", err
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-3-flash-preview")
	// ปรับ Prompt ให้เน้นการหารลงตัว (Divisible by 12)
	prompt := fmt.Sprintf(`
[ROLE] 
Expert in High-Performance Computing (HPC) and Python MPI for Raspberry Pi 4 Clusters.

[SYSTEM CONTEXT]
- Hardware: 3 Nodes, Total 12 Ranks.
- Memory: 4GB RAM per Node.

[MEMORY SAFETY RULES]
1. AVOID LARGE ARRAYS: For iterations over 50,000,000, DO NOT use 'np.arange' or create large lists.
2. USE STREAMING/ITERATION: Use simple 'for' loops with an accumulator variable or 'np.array_split' to process data in small chunks.
3. RAM LIMIT: Remember each Node has 4GB RAM shared among 4 ranks. Keep memory usage per rank below 500MB.

[TASK] 
Generate TWO Python versions for: %s
1. VERSION 1: SINGLE CORE (Sequential).
2. VERSION 2: CLUSTER (MPI 12 Ranks).

[STRICT ARCHITECTURE RULES]
1. WORKLOAD: Ensure 'N' or 'iterations' is explicitly divisible by 12. Round up if necessary.
2. THREADING: Both versions MUST start with:
   import os
   os.environ["OMP_NUM_THREADS"] = "1"
3. MPI SILENCE RULE (CRITICAL): 
   - ONLY rank 0 is allowed to print the final result and time.
   - All other ranks (rank > 0) MUST NOT print anything to stdout.
   - Use 'if rank == 0:' to wrap all print statements.
4. MPI LOGIC: 
   - Use 'comm.Reduce' or 'comm.Gather' to collect data to rank 0.
   - For result consistency, use np.random.seed(42).
5. FORMATTING:
   - Separate with: ===CLUSTER_VERSION_START===
   - Start with: import sys, time, numpy as np, os
   - End both versions with exactly:
     print(f"Result: {final_result_value}")
     print(f"Time taken: {duration} seconds")

[STRICT] Return ONLY raw Python code.
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
		return "", "", fmt.Errorf("AI failed partition")
	}

	return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]), nil
}

func main() {
	r := gin.Default()

	// CORS Setup...
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
		var req struct{ Input string }
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "Invalid"})
			return
		}

		sCode, cCode, err := generateCodes(context.Background(), req.Input)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		// **จุดที่แก้ไข**: ส่งโค้ดไปรอไว้ที่ Cluster ทันที
		go deployToCluster("temp_cluster.py", cCode)
		deployToCluster("temp_single.py", sCode) // ส่งไป Master เพื่อรัน Single ด้วย

		storeMutex.Lock()
		sessionStore[sessionID] = OptimizedSession{SingleCode: sCode, ClusterCode: cCode}
		storeMutex.Unlock()

		c.JSON(200, gin.H{"status": "optimized", "optimized_code": cCode})
	})

	r.POST("/api/run/single", func(c *gin.Context) {
		// รันบน Master (.55) เพื่อความยุติธรรมในการเทียบ Hardware เดียวกัน
		remoteCmd := "cd /home/pi/pi_libs && python3 temp_single.py"
		cmd := exec.Command("ssh", "-o", "StrictHostKeyChecking=no", "pi@192.168.162.55", remoteCmd)
		out, _ := cmd.CombinedOutput()
		c.JSON(200, gin.H{"output": string(out), "status": "success"})
	})

	r.POST("/api/run/cluster", func(c *gin.Context) {
		// **จุดที่แก้ไข**: สั่งรันอย่างเดียว ไม่ต้อง SCP แล้ว
		remoteCmd := "cd /home/pi/pi_libs && /usr/bin/mpiexec --hostfile cluster_hosts -n 12 --oversubscribe python3 temp_cluster.py"
		cmd := exec.Command("ssh", "-o", "StrictHostKeyChecking=no", "pi@192.168.162.55", remoteCmd)
		out, err := cmd.CombinedOutput()

		status := "success"
		if err != nil {
			status = "error"
		}
		c.JSON(200, gin.H{"output": string(out), "status": status})
	})

	r.Run(":8080")
}
