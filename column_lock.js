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
      if (head === "hlb new" || head === "new hlb") {
        blockColIdx = i;
        break; 
      }
      if (blockColIdx === -1 && (head.includes("ब्लॉक नम्बर") || head.includes("block no"))) {
        blockColIdx = i;
      }
    }
    if (blockColIdx === -1) blockColIdx = 7;

    // Helper to find map in Drive
    function findMap(blockVal) {
      if (!blockVal) return "";
      blockVal = blockVal.toString().trim();
      
      // Extract the first number from the string
      var match = blockVal.match(/\d+/);
      var numStr = match ? match[0] : blockVal;
      var numInt = parseInt(numStr, 10);
      
      try {
        var folderId = "1jkEnjLvEdWnS1KzK-1z4MO3i5ZoIChwh";
        var folder = DriveApp.getFolderById(folderId);
        
        // 1. Try exact matches with zero-paddings
        if (!isNaN(numInt)) {
          var paddings = [];
          var str = numInt.toString();
          paddings.push(str);
          if (str.length < 2) paddings.push("0" + str);
          if (str.length < 3) paddings.push("00" + str);
          if (str.length < 4) paddings.push("000" + str);
          
          for (var i = 0; i < paddings.length; i++) {
            var files = folder.getFilesByName(paddings[i] + ".pdf");
            if (files.hasNext()) return files.next().getUrl();
          }
        }
        
        // 2. Try raw string match just in case
        var rawFiles = folder.getFilesByName(blockVal + ".pdf");
        if (rawFiles.hasNext()) return rawFiles.next().getUrl();
        
        // 3. Fuzzy search fallback: search for the number, then verify
        var fuzzy = folder.searchFiles("title contains '" + numStr + "' and mimeType = 'application/pdf' and trashed = false");
        var possibleUrls = [];
        
        while (fuzzy.hasNext()) {
          var f = fuzzy.next();
          var fname = f.getName();
          
          if (!isNaN(numInt)) {
            // Ensure the file name actually contains this EXACT number (e.g. 5, not 15)
            var fNums = fname.match(/\d+/g) || [];
            for (var k = 0; k < fNums.length; k++) {
              if (parseInt(fNums[k], 10) === numInt) {
                return f.getUrl();
              }
            }
          }
          possibleUrls.push(f.getUrl());
        }
        
        if (possibleUrls.length > 0) return possibleUrls[0];
        
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

    var mappedData = [];
    if (userRow) {
      // Index 7 = HLB NEW (Column H), Index 8 = SUPERVISER NO. (Column I)
      var hlbNew = userRow[7] ? userRow[7].toString().trim() : "";
      var supervisorNo = userRow[8] ? userRow[8].toString().trim() : "";
      
      if (hlbNew === "" && supervisorNo !== "") {
        // USER IS A SUPERVISOR: Show all records with this Supervisor No
        for (var i = 0; i < dataRows.length; i++) {
          if (dataRows[i][8] && dataRows[i][8].toString().trim() === supervisorNo) {
            mappedData.push(createMappedObject(dataRows[i], i + 3)); // +3 because data array is 0-indexed and sheet is 1-indexed with 2 header rows
          }
        }
      } else {
        // NORMAL USER: Show only their own records (might be multiple if email repeated)
        for (var i = 0; i < dataRows.length; i++) {
          if (dataRows[i][0] && dataRows[i][0].toString().toLowerCase().trim() === cleanEmail) {
            mappedData.push(createMappedObject(dataRows[i], i + 3));
          }
        }
      }
    }

    function createMappedObject(row, rowIndex) {
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      
      var blockNo = row[blockColIdx];
      obj._mapLink = findMap(blockNo);
      obj._rowIndex = rowIndex;
      return obj;
    }
    
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
      
      var rowIndex = p.rowIndex || -1;
      var emailToFind = (p.data[headers[0]] || "").toString().toLowerCase().trim();
      
      if (rowIndex === -1 && emailToFind) {
        for (var i = 2; i < data.length; i++) {
          if (data[i][0] && data[i][0].toString().toLowerCase().trim() === emailToFind) {
            rowIndex = i + 1;
            break;
          }
        }
      }
      
      if (rowIndex !== -1) {
        // 1. BACKUP OLD DATA TO SHEET2
        if (backupSheet && (rowIndex - 1) < data.length) {
          var oldRow = data[rowIndex - 1].slice();
          oldRow.push(new Date());
          backupSheet.appendRow(oldRow);
        }
        
        var rowRange = mainSheet.getRange(rowIndex, 1, 1, headers.length);
        var currentFormulas = rowRange.getFormulas()[0];
        var currentValues = rowRange.getValues()[0];
        var locks = data[0]; // Locks are in Row 1
        
        var newRow = headers.map(function(h, index) { 
          // Preserve formula
          if (currentFormulas[index]) {
            return currentFormulas[index];
          }
          
          var isLocked = locks[index] && locks[index].toString().toLowerCase().trim() === "locked";
          if (isLocked) {
            // Preserve existing formula or value for locked cells
            return currentValues[index];
          }
          return p.data[h] != null ? p.data[h] : ""; 
        });
        
        rowRange.setValues([newRow]);
        return response({status: "success", msg: "Updated"});
      } else {
        if (!emailToFind) return response({status: "error", msg: "Primary ID (Email) missing in request"});
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
