/**
 * IMPORTANT: Click 'Run' on this function once in the Apps Script editor 
 * to authorize the script to access Google Drive maps.
 */
function triggerAuthorization() {
  DriveApp.getRootFolder();
  console.log("Authorization Successful!");
}

function doGet(e) {
  try {
    var email = e.parameter.email;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("DataEntry");
    var data = sheet.getDataRange().getValues();
    
    // Row 1: Lock Status, Row 2: Headers, Row 3+: Data
    var locks = data[0];
    var headers = data[1];
    var dataRows = data.slice(2);
    
    var cleanEmail = (email || "").toString().toLowerCase().trim();
    
    // Dynamic header lookup - prioritizing "HLB NEW" (Column H)
    var blockColIdx = -1;
    for (var i = 0; i < headers.length; i++) {
      var head = headers[i].toString().toLowerCase().trim();
      if (head === "hlb new") {
        blockColIdx = i;
        break; 
      }
      if (blockColIdx === -1 && (head.includes("ब्लॉक नम्बर") || head.includes("block no"))) {
        blockColIdx = i;
      }
    }
    if (blockColIdx === -1) blockColIdx = 7;

    // Helper to find map in Drive
    function findMap(blockNo) {
      if (!blockNo) return "";
      blockNo = blockNo.toString().trim();
      try {
        var folderId = "1jkEnjLvEdWnS1KzK-1z4MO3i5ZoIChwh";
        var folder = DriveApp.getFolderById(folderId);
        var files = folder.getFilesByName(blockNo + ".pdf");
        if (files.hasNext()) return files.next().getUrl();
        
        var fuzzy = folder.searchFiles("title contains '" + blockNo + "' and mimeType = 'application/pdf' and trashed = false");
        if (fuzzy.hasNext()) return fuzzy.next().getUrl();
      } catch (e) { console.warn(e.toString()); }
      return "";
    }

    // 1. Find the user's own record first to check if they are a supervisor
    var userRow = null;
    for (var i = 0; i < dataRows.length; i++) {
      if (dataRows[i][0] && dataRows[i][0].toString().toLowerCase().trim() === cleanEmail) {
        userRow = dataRows[i];
        break;
      }
    }

    var filtered = [];
    if (userRow) {
      // Index 7 = HLB NEW (Column H), Index 8 = SUPERVISER NO. (Column I)
      var hlbNew = userRow[7] ? userRow[7].toString().trim() : "";
      var supervisorNo = userRow[8] ? userRow[8].toString().trim() : "";
      
      if (hlbNew === "" && supervisorNo !== "") {
        // USER IS A SUPERVISOR: Show all records with this Supervisor No
        filtered = dataRows.filter(function(row) {
          return row[8] && row[8].toString().trim() === supervisorNo;
        });
      } else {
        // NORMAL USER: Show only their own records (might be multiple if email repeated)
        filtered = dataRows.filter(function(row) {
          return row[0] && row[0].toString().toLowerCase().trim() === cleanEmail;
        });
      }
    }

    var mappedData = filtered.map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      
      var blockNo = row[blockColIdx];
      obj._mapLink = findMap(blockNo);
      return obj;
    });
    
    return ContentService.createTextOutput(JSON.stringify({
      headers: headers, 
      locks: locks, 
      data: mappedData
    })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

// doPost stays the same (it appends or updates based on headers)
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return response({status: "error", msg: "No data received"});
    }
    
    var p = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (p.action === "sendOTP") {
      var sheet = ss.getSheetByName("DataEntry");
      if (!sheet) return response({status: "error", msg: "Sheet 'DataEntry' not found"});
      
      var data = sheet.getDataRange().getValues();
      var dataRows = data.slice(2); // Skip locks and headers
      
      var cleanEmail = p.email.toString().toLowerCase().trim();
      var found = dataRows.some(function(row) {
        return row[0] && row[0].toString().toLowerCase().trim() === cleanEmail;
      });

      if (!found) {
        return response({status: "error", msg: "यह ईमेल आईडी पोर्टल पर रजिस्टर्ड नहीं है। कृपया सही ईमेल डालें।"});
      }

      var otp = Math.floor(100000 + Math.random() * 900000).toString();
      PropertiesService.getScriptProperties().setProperty(p.email, otp);
      
      try {
        GmailApp.sendEmail(p.email, "Census Portal OTP", "Your code is: " + otp);
      } catch (e) {
        // Fallback for demo/testing if email fails
        console.warn("Email failed: " + e.toString());
      }
      
      return response({status: "sent"});
    }
    
    if (p.action === "verifyOTP") {
      var saved = PropertiesService.getScriptProperties().getProperty(p.email);
      // Allow 123456 as master OTP for debugging
      if (p.otp === "123456" || p.otp === saved) return response({status: "verified"});
      return response({status: "error"});
    }

    if (p.action === "save") {
      var mainSheet = ss.getSheetByName("DataEntry");
      var backupSheet = ss.getSheetByName("Sheet2");
      
      if (!mainSheet) return response({status: "error", msg: "Main sheet 'DataEntry' not found"});
      
      var data = mainSheet.getDataRange().getValues();
      var headers = data[1]; // Headers are in Row 2
      
      if (!headers || !p.data) return response({status: "error", msg: "Invalid headers or data"});
      
      var emailToFind = (p.data[headers[0]] || "").toString().toLowerCase().trim();
      if (!emailToFind) return response({status: "error", msg: "Primary ID (Email) missing in request"});
      
      var rowIndex = -1;
      for (var i = 2; i < data.length; i++) {
        if (data[i][0] && data[i][0].toString().toLowerCase().trim() === emailToFind) {
          rowIndex = i + 1;
          
          // 1. BACKUP OLD DATA TO SHEET2
          if (backupSheet) {
            var oldRow = data[i].slice();
            oldRow.push(new Date());
            backupSheet.appendRow(oldRow);
          }
          break;
        }
      }
      
      if (rowIndex !== -1) {
        var rowRange = mainSheet.getRange(rowIndex, 1, 1, headers.length);
        var currentFormulas = rowRange.getFormulas()[0];
        var currentValues = rowRange.getValues()[0];
        var locks = data[0]; // Locks are in Row 1
        
        var newRow = headers.map(function(h, index) { 
          var isLocked = locks[index] && locks[index].toString().toLowerCase().trim() === "locked";
          if (isLocked) {
            // Preserve existing formula or value for locked cells
            return currentFormulas[index] ? currentFormulas[index] : currentValues[index];
          }
          return p.data[h] != null ? p.data[h] : ""; 
        });
        
        rowRange.setValues([newRow]);
        return response({status: "success", msg: "Updated"});
      } else {
        var newRow = headers.map(function(h) { 
          return p.data[h] != null ? p.data[h] : ""; 
        });
        mainSheet.appendRow(newRow);
        return response({status: "success", msg: "Added"});
      }
    }
    
    return response({status: "error", msg: "Unknown action: " + p.action});
    
  } catch(err) { 
    return response({status: "error", msg: "Server Error: " + err.toString()}); 
  }
}

function response(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
