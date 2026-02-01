# Refactored MCP Tools for Auto-Apply Workflow

## Architecture Principle
**Data Fetching:** MCP tools (composable, independent)  
**Data Processing:** Gemini AI (when provided with data)  
**Orchestration:** n8n (visual workflow, conditional logic)

---

## Atomic Tools Structure

```
┌─────────────────────────────────────────────────────────┐
│ N8N Orchestrates Data Flow                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. readLocalResume()          → Gets resume text       │
│  2. FetchGithubLanguages()     → Gets tech stack        │
│  3. GithubDataFetcher()        → Gets profile info      │
│  4. [Combine all data]         → Package for AI         │
│  5. enrichResumeWithAI()       → AI processes data      │
│  6. scoreJobMatch()            → AI analyzes fit        │
│  7. [Conditional decision]     → Apply or skip          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## New Atomic Tools (Corrected)

### 1. `enrichResumeWithAI(resumeText, githubData)`
**Purpose:** AI-powered resume enhancement using pre-fetched data

**Input:**
```json
{
  "resumeText": "Your resume text from readLocalResume()",
  "githubData": {
    "languages": "Tech stack data from FetchGithubLanguages()",
    "userInfo": "Profile data from GithubDataFetcher()",
    "projects": "Project list from getGithubProjects()",
    "profileUrl": "https://github.com/username"
  }
}
```

**What it does:**
- ✅ Receives pre-fetched GitHub data (from your MCP tools)
- ✅ Passes data to Gemini for intelligent formatting/enhancement
- ✅ Merges resume + GitHub info into polished version
- ✅ Returns enhanced resume ready for applications

**Key Point:** Data fetching happens via YOUR existing tools → n8n combines → enrichResumeWithAI() processes

---

### 2. `scoreJobMatch(jobDescription, resumeText, scoreThreshold = 6)`
**Purpose:** AI-powered job fit analysis

**Input:**
```json
{
  "jobDescription": "Full job description text",
  "resumeText": "Resume text (original or enriched)",
  "scoreThreshold": 6
}
```

**Output:**
```json
{
  "content": [{
    "type": "text",
    "text": {
      "score": 8,
      "reason": "Strong match - 5+ years exp, skilled in required stack",
      "matchedSkills": ["JavaScript", "React", "Node.js", "AWS"],
      "missingSkills": ["GraphQL"],
      "recommendation": "apply"
    }
  }],
  "metadata": {
    "score": 8,
    "shouldApply": true
  }
}
```

---

## N8N Workflow (Correct Flow)

```
JOB BOARD TRIGGER
  ↓
[Step 1] Read Resume
  └─→ MCP: readLocalResume(resumePath)
  └─→ Output: resumeText ✓
  ↓
[Step 2] Fetch GitHub Languages  
  └─→ MCP: FetchGithubLanguages(username, repo)
  └─→ Output: techStack ✓
  ↓
[Step 3] Fetch GitHub User Info
  └─→ MCP: GithubDataFetcher(username)
  └─→ Output: userInfo ✓
  ↓
[Step 4] Combine GitHub Data
  └─→ Code: Build githubData object
  └─→ Output: { languages, userInfo, ... } ✓
  ↓
[Step 5] Enrich Resume with AI
  └─→ MCP: enrichResumeWithAI(resumeText, githubData)
  └─→ Gemini: "Enhance this resume with this GitHub data"
  └─→ Output: enrichedResume ✓
  ↓
[Step 6] Score Job Match
  └─→ MCP: scoreJobMatch(jobDescription, enrichedResume)
  └─→ Gemini: "Score this job fit"
  └─→ Output: { score, matched, missing, recommendation } ✓
  ↓
[Step 7] Conditional Decision
  └─→ IF score >= 6
      ├─ YES: Apply + Log + Notify
      └─ NO:  Skip + Log reason
```

---

## N8N Configuration Example

### Step 1: Read Resume
```
Tool: readLocalResume
Input: { resumePath: "./resume.pdf" }
Store as: resumeText
```

### Step 2: Fetch GitHub Languages
```
Tool: FetchGithubLanguages
Input: { username: "your-username", repo: "your-username" }
Store as: techStack
```

### Step 3: Fetch GitHub User Info
```
Tool: GithubDataFetcher
Input: { username: "your-username" }
Store as: userInfo
```

### Step 4: Combine Data (Code Block in n8n)
```javascript
return {
  languages: {{ $json.techStack }},
  userInfo: {{ $json.userInfo }},
  profileUrl: "https://github.com/your-username"
}
```
Store as: githubData

### Step 5: Enrich Resume (YOUR AI CALL)
```
Tool: enrichResumeWithAI
Input:
  - resumeText: {{ $json.resumeText }}
  - githubData: {{ $json.githubData }}
Store as: enrichedResume
```

### Step 6: Score Job (GEMINI ANALYSIS)
```
Tool: scoreJobMatch
Input:
  - jobDescription: {{ $json.job_description }}
  - resumeText: {{ $json.enrichedResume }}
  - scoreThreshold: 6
Store as: jobScore
```

### Step 7: Decision Logic
```javascript
IF ({{ $json.jobScore.metadata.shouldApply }}) 
  THEN: Apply → Save to DB → Send notification
  ELSE: Skip → Log rejection reason
```

---

## Data Flow Simplified

```
YOUR EXISTING TOOLS (Data Fetching)
  readLocalResume()
  FetchGithubLanguages()
  GithubDataFetcher()
  [More tools...]
        ↓↓↓
  N8N combines data
        ↓↓↓
NEW AI TOOLS (Data Processing)
  enrichResumeWithAI()    ← Uses Gemini to enhance
  scoreJobMatch()         ← Uses Gemini to analyze
        ↓↓↓
  Decisions & Actions
```

---

## Key Insight

You were RIGHT to question my initial approach:

❌ **Wrong:** enrichResumeWithAI(resumeText, githubUsername) - AI tries to fetch GitHub  
✅ **Correct:** enrichResumeWithAI(resumeText, githubData) - AI processes provided data

Your existing tools ARE the GitHub data fetchers. The new AI tools just FORMAT/ENHANCE that data using Gemini.

---

## Summary

- **MCP tools:** Fetch GitHub data (your existing tools work perfectly)
- **n8n:** Orchestrates and combines data
- **enrichResumeWithAI():** Receives combined data, lets Gemini enhance it
- **scoreJobMatch():** Receives job + resume, lets Gemini analyze
- **Result:** Clean separation of concerns, AI + Data, Orchestration layer

Perfect architecture! 🚀

