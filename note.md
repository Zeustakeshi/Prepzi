# Ôn tập AI in Action

## Nội dung các bài chuyên sâu Track 3

### 1. Kiến trúc Agent


#### ReAct

Agent có khả năng thực hiện hành động trong thực tế

🧠 Suy nghĩ → 🛠️ Hành động → 👀 Quan sát → 🧠 Suy nghĩ tiếp...

ReAct (kết hợp suy luận và hành động) cho Agent khả năng vừa suy luận vừa gọi công cụ.

- Điểm yếu: Sai bước đầu có thể dẫn đến sai cả chuỗi hành động

#### Reflexion

Agent có khả năng xem xét lại bản thân 

Reflexion = làm → đánh giá → rút kinh nghiệm → thử lại.

#### Plan – Act – Verify

Agent lên kế hoạch trước khi hành động -> hành động -> kiểm tra lại kết quả

#### Multi-Agent


Multi-Agent (hệ thống đa Agent — nhiều Agent phối hợp để hoàn thành một nhiệm vụ) có nghĩa cốt lõi là:

👥 Nhiều Agent đảm nhận những vai trò/nhiệm vụ khác nhau và phối hợp với nhau.

#### Supervisor

- Agent giám xác agetn khác làm việc

#### Debate

- 2 Agent tranh luận với nhau

#### Parallel

- 2 Agent chay song song làm những việc k ảnh hướng tới nhau

#### LangGraph

Framework hỗ trợ xây dựng Agent theo dang đồ thi các node 

#### State Graph

Trạng thái đồ thị của langgraph có state , có thể chia sẽ cho các node khác nhau trong cùng 1 graph

#### Conditional Edges

Cạnh để điều hướng luồng Agent dựa trên điều kiện 

#### Checkpointing

Khả năng quay lại bước trước đó của flow sau khi có lổi 

### 2. Memory & Context

#### Agent Stateless

- Agent được thiét kế theo dạng stateless vì mỗi request lên LLM đều là riêng biệt khong lưu lại bộ nhớ làm vậy sẽ dễ mở rộng

#### 7 lớp Context

Bao gồm các lớp:
- tool  memory 
- system memory 
- user memory 
- policy memory
- ....

#### Short-term Memory

Bộ nhớ ngắn hạn hay còn gọi là working memory dùng để luuư trữ bộ nhớ làm việc của agent để các lần gọi api trong cùng 1 phiên lên LLM provider không bi mất ngữ cảnh trong phiên làm việc

#### Long-term Memory

Bộ nhớ dài hạn có thể share được giữa nhiều phiên với nhau agent sẽ nhớ lâu hơn và hiểu người dùng hơn
#### Episodic Memory

không nhớ 

#### Semantic Memory


không nhớ 

#### Context Window

bộ nhớ trong 1 lần gợi request dến llm 


#### External Memory

Bộ nhớ bên ngoài như datbase sẽ được trury xuất và chọn lọc để gửi vào context window cho llm

### 3. RAG & Tri thức

#### Production RAG

Hệ thống RAG sẳn sàng trong production 

#### Offline Pipeline

#### Parse


#### Chunk

Chia nhỏ dữ liệu sau khi parse thành các phần nhỏ để có thể đưa đưc vào llm 

#### Enrich

Làm giàu dữ liệu thêm dưe liệu mới, tóm tắt lại dữ liệu, ....

#### Embed

Chuyển các chunk của dữ liệu thành dạng vector để sau này khi cần dễ dàng tìm kiếm và truy xuất bằng ngữ nghĩa 


#### Index

Đánh số thứ tự, metadata cho các chunk lưu trong database để truy vấn nhanh hơn theo các thông tin đã đánh index


#### Online Pipeline

#### Retrieve

tìm kiếm các chunk có liênq uan đến câu hỏi của người dùng

#### Rerank

Sau khi truy xuuất có nhiều kết quá và xếp hạng các kết quả cho phù hợp với yêu cầu của người dùng


#### Augment

Thêm các chunk đã được sắp xếp vào prompt gữi đền llm 


#### Generate

LLM dựa trên ngữ cảnhh sinh ra câu trả lời cho người dùng
 
#### GraphRAG

1 dang5 cải tiến của RAG có thể truy xuất các thông tin ó mối quan hệ với nhau qua đồ thị

#### Knowledge Graph


Bộ nhó của LLM Agent nhưng được tổ chức dưới dạng đồ thị


#### Multi-hop Reasoning

#### RAGAS

#### Error Tree

### 4. Fine-tuning & Alignment

#### Prompt vs RAG vs Fine-tune

#### LoRA

#### QLoRA

#### SFT

#### RLHF

#### DPO

#### ORPO

#### SimPO

#### KTO

#### GRPO

#### RLVR

### 5. Evaluation, Guardrails & Reliability

#### RAGAS

#### LLM-as-a-Judge

#### Guardrails

#### Circuit Breaker

#### Fallback

#### Caching

#### Observability

#### SLO

### 6. MCP & Human-in-the-Loop

#### MCP

#### N×M Problem

#### Host – Client – Server

#### Tools

#### Resources

#### Prompts

#### Approval

#### Clarification

#### Escalation

#### Review

#### Edit/Correction

#### Confidence Routing

#### Autonomy Spectrum




------------

#### TỪ KHÓA BÀI THI

1. Chỉ số đánh giá (RAGAS)

4 metrics RAGAS
Context Relevancy
Answer Relevancy
Faithfulness
Context Recall

2. Kỹ thuật RAG

RAG
RAGAS
Retrieval-Augmented Generation
Indexing pipeline
Generative

3. Xử lý tài liệu

Document
Chunk
Metadata
Chunking (kỹ thuật chia nhỏ)
Overlapping

4. AI Agent

Single agent
Multi agent
React (3 bước)
Fine tune
Monitor worker

5. Các khái niệm khác

ROI 12 tháng
Chi phí
Pipeline
Metrics
Context
Source
Doc_id
Timestamp

6. Dạng câu hỏi

Điền từ khóa
Nối các bước
Sắp xếp các bước
Trắc nghiệm
Tự luận