import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import {OpenAI} from 'openai'
import { RetrievalQAChain } from "langchain/chains";
import { VectorDBQAChain } from "langchain/chains";
import dotenv from "dotenv";
dotenv.config();

import { v4 as uuidv4 } from "uuid";
import { OpenAIStream, StreamingTextResponse } from 'ai'
import fs from "fs"
import { MongoClient } from "mongodb";

const langchain = async (req,res) => {
    try {
      const file = req.file;
      const {train_id} = req.body;
      const loader = new PDFLoader(file.path);
      // console.log( "loader is ",loader)
      const docs = await loader.load();
      // console.log("docs is " ,docs)
  
      // Splitting the document text
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 20,
      });
      const docOutput = await splitter.splitDocuments(docs);
  
      // Creating Pinecone and PineconeStore
      const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
        environment: process.env.PINECONE_ENVIRONMENT,
      });
      const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX);
  
      // Checking if required environment variables are present
      if (
        !process.env.OPENAI_API_KEY ||
        !process.env.PINECONE_API_KEY ||
        !process.env.PINECONE_ENVIRONMENT ||
        !process.env.PINECONE_INDEX
      ) {
        console.error("Missing required environment variables.");
        throw new Error("Missing configuration for Vector DB")
      } else {
        console.log("Everything is ok");
      }
  
      let trainId = crypto.randomUUID()

      if(train_id){
        trainId = train_id
      }
      else{
        trainId = crypto.randomUUID()
      }

      console.log("TRAINID",trainId)
  
      // Creating PineconeStore from documents with OpenAIEmbeddings
      const vectorstore = await PineconeStore.fromDocuments(
        docOutput,
        new OpenAIEmbeddings({
          openAIApiKey: process.env.OPENAI_API_KEY,
        }),
        {
          pineconeIndex,
          namespace: trainId,
        }
      );
  
      // console.log(vectorstore)
  
      // const vectorstoreRetriever = vectorstore.asRetriever();
  
    //   const analyzedFile = await Analyze.create(
    //     {title,
    //     userId,
    //     trainId:namespace}
    //   );

    fs.unlinkSync(file.path)
  
      return res.status(200).send({
        code:200,
        status:1,
        message:"File analyzed succesfully!",
        data:trainId,
        error:null
      });
  
    //   {
    //   // Creating OpenAI model and RetrievalQAChain
    //   const model = new OpenAI({
    //     modelName: "gpt-3.5-turbo",
    //   });
  
    //   const chain = RetrievalQAChain.fromLLM(model, vectorstoreRetriever);
  
    //   const response = await chain.call({
    //     query: query,
    //   });
  
    //   const answer = response.text;
    //   // console.log(answer)
    //   return {
    //     query,
    //     answer,
    //   };
    // }
    } catch (error) {
      fs.unlinkSync(req.file.path)
      console.error(error);
      return res.status(500).send({
        code:500,
        status:0,
        message:"Internal Server Error",
        error:error.message,
        data:{}
      })
      throw new Error("Failed to upload file")
    }
  };
  
  const askQuery = async (req,res) => {
    try {

      const {trainId,query,platform} = req.body;

      let DB_URI;

      if(platform == "app"){
        DB_URI = process.env.APP_DB_URI
      }
      else if(platform =="mygrades"){
        DB_URI = process.env.MYGRADES_DB_URI
      }

      const client = new MongoClient(DB_URI);
      await client.connect();

    const database = client.db();
    const messagesCollection = database.collection("messages");
    const messages = await messagesCollection.find({trainId,created_at:1}).toArray();
    console.log(messages)

      // 1: vectorize message
      const embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
      });
  
      const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
        environment: process.env.PINECONE_ENVIRONMENT,
      });
      const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX);
  
      const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex,
        namespace: trainId,
      });
  
      const results = await vectorStore.similaritySearch(query, 4);
    //   console.log(results)
  
    //   const prevMessages = await openaiModel.find(
    //     { fileId },
    //     { created_at: "asc" }
    //   );
  
      const formattedPrevMessages = messages.map((msg) => ({
        role: msg.role,
        content: msg.text,
      }));
  
      const openAi = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
  
      // console.log(openai)
  
      const responseMessages = [];
  
      const response = await openAi.chat.completions.create({
        model: "gpt-3.5-turbo",
        temperature: 0,
        stream: true,
        messages: [
          {
            role: "system",
            content:
              "Use the following pieces of context (or previous conversaton if needed) to answer the users question in markdown format.",
          },
          {
            role: "user",
            content: `Use the following pieces of context (or previous conversaton if needed) to answer the users question in markdown format. \nIf you don't know the answer, just say that you don't know, don't try to make up an answer.
          
    \n----------------\n
    
    PREVIOUS CONVERSATION:
    ${formattedPrevMessages.map((message) => {
      if (message.role === "user") return `User: ${message.content}\n`;
      return `Assistant: ${message.content}\n`;
    })}
    
    \n----------------\n
    
    CONTEXT:
    ${results.map((r) => r.pageContent).join("\n\n")}
    
    USER INPUT: ${query}`,
          },
        ],
      });
  
      for await (const part of response) {
        responseMessages.push(part.choices[0]?.delta?.content || "");
      }
  
      
      const formattedResponse = responseMessages
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    //   console.log("Response Messages:", formattedResponse);

      return res.status(200).send({
        code:200,
        status:1,
        message:"Query responded successfully!",
        data:formattedResponse,
        error:null
      })
    } catch (error) {
      console.log(error);
      return res.status(500).send({
        code:500,
        status:0,
        message:"Internal Server Error!",
        data:{},
        error:error.message
      })
    }
  };
  
  //export the function
  // langchain()
export {langchain,askQuery}
  