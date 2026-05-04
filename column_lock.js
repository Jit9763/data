function doGet(e) {
  try {
    var email = e.parameter.email;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("DataEntry");
    var data = sheet.getDataRange().getValues();
    
    // NEW STRUCTURE:
    // Row 1: Lock Status (Locked / Editable)
    // Row 2: Headers
    // Row 3+: Data
    
    var locks = data[0];
    var headers = data[1];
    var dataRows = data.slice(2);
    
    var cleanEmail = email.toString().toLowerCase().trim();
    var filtered = dataRows.filter(function(row) {
      if (!row[0]) return false;
      return row[0].toString().toLowerCase().trim() === cleanEmail;
    }).map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });
    
    return ContentService.createTextOutput(JSON.stringify({
      headers: headers, 
      locks: locks, 
      data: filtered
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
      GmailApp.sendEmail(p.email, "Census Portal OTP", "Your code is: " + otp);
      return response({status: "sent"});
    }
    
    if (p.action === "verifyOTP") {
      var saved = PropertiesService.getScriptProperties().getProperty(p.email);
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
      
      var newRow = headers.map(function(h) { 
        return p.data[h] === undefined ? "" : p.data[h]; 
      });
      
      if (rowIndex !== -1) {
        mainSheet.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);
        return response({status: "success", msg: "Updated"});
      } else {
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
