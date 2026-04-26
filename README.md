# 📚 StudyMate AI – RAG Powered Notes Assistant

## 🚀 Description

StudyMate AI is an AI-powered study assistant built using the concept of **Retrieval Augmented Generation (RAG)**. It enables users to upload their own study materials (notes, documents, or images) and ask questions based on that content.

Unlike traditional AI systems, StudyMate AI generates responses strictly from the uploaded data, ensuring accurate, context-based answers and eliminating reliance on general knowledge.

This makes it highly useful for students to revise, understand concepts, and interact with their own learning resources in a smarter way.

---

## 🎯 Problem Statement

Students often struggle to revise and extract key information from large volumes of notes. Traditional AI tools provide generic answers that may not align with personal study material.

StudyMate AI solves this by allowing users to:
- Upload their own notes
- Ask questions
- Receive answers strictly based on their content

---

## ✨ Features

- 📂 Upload files, folders, and images  
- 💬 Interactive chat-based interface  
- 🔍 Retrieval-based answer generation (RAG)  
- ⚡ Real-time AI responses using Gemini (Lovable AI)  
- 🧠 Context-aware answers (based only on user data)  
- 🧾 Clean and user-friendly UI  
- 🔄 Multiple queries on the same dataset  

---

## 🛠️ Technologies Used

- **Lovable AI Platform**
- **Google Gemini API** (for response generation)
- **RAG Architecture (Retrieval + Generation)**
- **Lovable Cloud Storage** (for data storage and retrieval)

---

## 🧠 How It Works (RAG Pipeline)

1. **User Uploads Data**
   - Notes, PDFs, images, or text content

2. **Data Processing**
   - Content is extracted and split into smaller chunks

3. **Storage**
   - Processed data is stored in Lovable cloud

4. **User Query**
   - User asks a question through chat interface

5. **Retrieval**
   - System searches and retrieves relevant chunks

6. **Generation**
   - Retrieved context is sent to Gemini AI
   - AI generates answer based only on retrieved data

---

## ⚠️ Important Constraint

- The system **does NOT use general AI knowledge**
- If the answer is not found in uploaded data, it returns:
  > "Answer not found in the provided data"

---

## 📊 Evaluation & Performance

The application was tested through live interaction using **Perplexity Comet** and achieved:

> **✅ 87% Performance Score (8.7/10)**

This reflects:
- Strong retrieval accuracy  
- Reliable context-based generation  
- Effective user interaction  

---

## 🧪 Sample Input & Output

### Input:
What is the main concept explained in the notes?

### Output:
The answer is generated based on the relevant content retrieved from the uploaded notes.


---

## 📌 Assumptions

- A lightweight retrieval mechanism is used instead of a full vector database due to platform constraints
- The system focuses on correctness and clarity over complexity
- Designed for demonstration and educational purposes

---

## 🔗 Project Access

> Link to access the project: https://studymaterag.lovable.app/

## Demo Video

> Link to access the live Demo Video: https://drive.google.com/file/d/1ZwDf6cASaHqbatxzGm2ZbUR1ploV2Ft_/view?usp=sharing

---

## 🎯 Conclusion

StudyMate AI demonstrates a practical implementation of RAG by combining retrieval and AI generation to create a reliable, student-focused learning assistant. It transforms static notes into an interactive knowledge system.

---

## 🙌 Author

**Mohammed Faizal**  
Campus Ambassador | AI & Automation Enthusiast  

---
