import multer from "multer";

// Define the file storage and type filter using Multer
const storage = multer.diskStorage({
  destination: './uploads', // Define your file upload destination
  filename: (req, file, callback) => {
    callback(null,'_' + Date.now() + file.originalname);
  }
}); // Store the file in memory
const upload = multer({
  storage: storage,
  fileFilter: (req, file, callback) => {
    validateFileType(req,file, callback);
  },
}) // 'file' is the field name in the form

// Custom function to validate file type
function validateFileType(req,file, callback) {
    const allowedFileTypes = ['csv', 'pdf', 'xlsx', 'xlsm', 'xlsb', 'xltx', 'doc', 'docm','docx','js','jsx','ts','tsx','html','css','py','php'];
    const fileExt = file.originalname.split('.').pop().toLowerCase();
    if (allowedFileTypes.includes(fileExt)) {
      return callback(null, true);
    }
    else{
      req.fileValidationError = 'Invalid file type';
    callback(null, false);
    }
  };

  export {upload,validateFileType}