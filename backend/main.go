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
	Code         string `json:"code"`
	Mode         string `json:"mode"`
	OnlyOptimize bool   `json:"onlyOptimize"`
}

func optimizeCodeWithAI(userCode string) (string, error) {
	ctx := context.Background()
	apiKey := "AIzaSyCegg7Ssvw7Q0OESl9OmOXDl-pTiZupVD0"
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return "", err
	}
	defer client.Close()

	// ✅ สลับเอา gemini-1.5-pro ขึ้นเป็นอันดับ 1
	// โมเดลนี้จะฉลาดกว่า และมีเพดาน Quota แยกจากรุ่น Flash
	modelNames := []string{"gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.5-flash"}

	prompt := fmt.Sprintf(`
        Target: Convert Python code to use 'mpi4py' for a distributed cluster.
        Context: Running on a cluster with 'mpiexec --hostfile cluster_hosts -n 12'. 
        Constraint: Ensure the code correctly implements MPI rank-based logic (comm.Get_rank()). 
        Return ONLY raw Python code without markdown blocks or explanations.
        
        Input Code:
        %s`, userCode)

	var lastErr error
	for _, mName := range modelNames {
		fmt.Printf("🤖 Trying model: %s\n", mName)
		model := client.GenerativeModel(mName)
		resp, err := model.GenerateContent(ctx, genai.Text(prompt))

		if err != nil {
			lastErr = err
			// ถ้าเจอ Error 429 (Quota เต็ม) ให้ข้ามไปลองตัวถัดไปทันที
			if strings.Contains(err.Error(), "429") {
				fmt.Printf("⚠️ Model %s is busy (Quota), switching...\n", mName)
				continue
			}
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

	return "", fmt.Errorf("AI Error: All models failed. Last error: %v", lastErr)
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

		masterIp := "192.168.162.55"
		user := "pi"
		pass := "install123"
		var remoteCmd string
		var finalCode string

		if req.Mode == "cluster_run_only" {
			finalCode = req.Code
			remoteCmd = fmt.Sprintf(`cat << 'EOF' > /home/pi/cluster_job.py
%s
EOF
cd /home/pi && mpiexec --hostfile cluster_hosts -n 12 \
--mca plm_rsh_args "-o StrictHostKeyChecking=no" \
--map-by :OVERSUBSCRIBE \
python3 /home/pi/cluster_job.py`, finalCode)
		} else if req.Mode == "cluster" {
			optimizedCode, err := optimizeCodeWithAI(req.Code)
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
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
			finalCode = req.Code
			remoteCmd = fmt.Sprintf(`cat << 'EOF' > /home/pi/single_job.py
%s
EOF
python3 /home/pi/single_job.py`, finalCode)
		}

		output, err := executeRemoteCommand(masterIp, user, pass, remoteCmd)
		if err != nil {
			c.JSON(500, gin.H{"status": "failed", "details": output})
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
