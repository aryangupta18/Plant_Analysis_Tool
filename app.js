require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfDOC = require('pdfkit');
const fsPromises = fs.promises;
const {GoogleGenerativeAI} = require('@google/generative-ai');
const { buffer } = require('stream/consumers');
const { log } = require('console');

const port = 8082;
const app = express();
app.use(express.urlencoded({ extended: true }));

// configure multer
const uploadDir = path.join(__dirname, 'upload');
// ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({
    dest: uploadDir,
});
// initialize AI
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
app.use(express.static('public'));

// analyze port
app.get('/analyze',(req,res)=>{
    res.json({success:'true'});
})
app.post('/analyze', upload.any(), async (req,res)=>{
    try {
        // multer upload.any() populates req.files (array)
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: 'Please upload a file first.'
            });
        }
        const file = req.files[0];
        const imgPath = file.path;
        const imgData = await fsPromises.readFile(imgPath,{
            encoding:'base64'
        });
        const model = genAI.getGenerativeModel({
            model:"gemini-2.5-flash",
        });
        const result = await model.generateContent(
            'Analyze this plant image and provide detailed analysis of its species, health, and care recommendations, its characteristics, care instructions, and any interesting facts. Please provide the response in plain text without using any markdown formatting', {
                inlineData: {
                    mimeType: file.mimetype,
                    data: imgData,
                },
            },
        );
        const plantInfo = result.response.text();
        await fsPromises.unlink(imgPath);
        res.json({
            result:plantInfo,
            image: `data:${file.mimetype};base64,${imgData}`
        });
    } catch (error) {
        res.status(500).json({
            message: error.message,
        })
    }
});

app.post("/download", express.json(), async (req, res) => {
  const { result, image } = req.body;
  try {
    //Ensure the reports directory exists
    const reportsDir = path.join(__dirname, "reports");
    await fsPromises.mkdir(reportsDir, { recursive: true });
    //generate pdf
    const filename = `plant_analysis_report_${Date.now()}.pdf`;
    const filePath = path.join(reportsDir, filename);
    const writeStream = fs.createWriteStream(filePath);
    const doc = new pdfDOC();
    doc.pipe(writeStream);
    // Add content to the PDF
    doc.fontSize(24).text("Plant Analysis Report", {
      align: "center",
    });
    doc.moveDown();
    doc.fontSize(24).text(`Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();
    doc.fontSize(14).text(result, { align: "left" });
    //insert image to the pdf
    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      doc.moveDown();
      doc.image(buffer, {
        fit: [500, 300],
        align: "center",
        valign: "center",
      });
    }
    doc.end();
    //wait for the pdf to be created
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
    res.download(filePath, (err) => {
      if (err) {
        res.status(500).json({ error: "Error downloading the PDF report" });
      }
      fsPromises.unlink(filePath);
    });
  } catch (error) {
    console.error("Error generating PDF report:", error);
    res
      .status(500)
      .json({ error: "An error occurred while generating the PDF report" });
  }
});

app.listen(port, ()=>{
    console.log("server is running at http://localhost:8082");
});