import express from "express";
import cors from "cors"
import { upload } from "./helpers/file_validation.js";
import { askQuery, langchain } from "./controllers/file_analysis_controller.js";

const app = express();
app.use(cors());
app.use(express.json());


app.post("/upload",upload.single("file"),langchain);

app.post("/ask",askQuery)

app.listen(8080,async()=>{
    console.log("Server is running at port 8080");
})