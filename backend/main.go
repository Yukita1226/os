package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"golang.org/x/crypto/ssh"
	"google.golang.org/api/option"
)

type DeployRequest struct {
	Code string `json:"code"`
	Mode string `json:"mode"` // เพิ่มโหมด "single" หรือ "cluster"
}

func optimizeCodeWithAI(userCode string) (string, error) {
	ctx := context.Background()
	apiKey := "AIzaSyBFlYZs92YYa3SHG8kijw2hlq5EZcftVBc"
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return "", err
	}
	defer client.Close()

	model := client.GenerativeModel("models/gemini-2.0-flash")

	prompt := fmt.Sprintf(`
        Target: Convert Python code to use 'mpi4py' for a distributed cluster.
        Context: Running on a cluster with 'mpiexec --hostfile cluster_hosts -n 12'. 
        Constraint: Ensure the code correctly implements MPI rank-based logic (comm.Get_rank()). 
        Return ONLY raw Python code without markdown blocks or explanations.
        
        Input Code:
        %s
    `, userCode)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		model = client.GenerativeModel("models/gemini-flash-latest")
		resp, err = model.GenerateContent(ctx, genai.Text(prompt))
		if err != nil {
			return "", fmt.Errorf("AI Error: %v", err)
		}
	}

	if len(resp.Candidates) > 0 {
		if part, ok := resp.Candidates[0].Content.Parts[0].(genai.Text); ok {
			cleanCode := string(part)
			cleanCode = strings.ReplaceAll(cleanCode, "```python", "")
			cleanCode = strings.ReplaceAll(cleanCode, "```", "")
			return strings.TrimSpace(cleanCode), nil
		}
	}
	return "", fmt.Errorf("AI could not process response")
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
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		masterIp := "192.168.162.55"
		user := "pi"
		pass := "install123"
		var remoteCmd string
		var finalCode string

		if req.Mode == "cluster" {
			fmt.Println("🤖 Mode: Cluster (MPI Optimization)")
			optimizedCode, err := optimizeCodeWithAI(req.Code)
			if err != nil {
				c.JSON(500, gin.H{"error": "AI Optimization failed: " + err.Error()})
				return
			}
			finalCode = optimizedCode
			remoteCmd = fmt.Sprintf(`cat << 'EOF' > /home/pi/cluster_job.py
%s
EOF
cd /home/pi && mpiexec --hostfile cluster_hosts -n 12 \
--mca plm_rsh_args "-o StrictHostKeyChecking=no" \
--map-by :OVERSUBSCRIBE \
python3 /home/pi/cluster_job.py`, finalCode)
		} else {
			fmt.Println("🏃 Mode: Single Core (Sequential)")
			finalCode = req.Code // ใช้โค้ดเดิม ไม่ผ่าน AI
			remoteCmd = fmt.Sprintf(`cat << 'EOF' > /home/pi/single_job.py
%s
EOF
python3 /home/pi/single_job.py`, finalCode)
		}

		fmt.Printf("🚀 Executing %s mode on Master...\n", req.Mode)
		output, err := executeRemoteCommand(masterIp, user, pass, remoteCmd)

		if err != nil {
			c.JSON(500, gin.H{
				"status":  "failed",
				"message": "Execution failed",
				"details": output,
			})
			return
		}

		c.JSON(200, gin.H{
			"status":         "success",
			"mode":           req.Mode,
			"optimized_code": finalCode,
			"output":         output,
		})
	})

	r.Run(":8080")
}

func executeRemoteCommand(ip, user, password, cmd string) (string, error) {
	config := &ssh.ClientConfig{
		User:            user,
		Auth:            []ssh.AuthMethod{ssh.Password(password)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         60 * time.Second,
	}

	client, err := ssh.Dial("tcp", ip+":22", config)
	if err != nil {
		return "", err
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()

	out, err := session.CombinedOutput(cmd)
	return string(out), err
}
