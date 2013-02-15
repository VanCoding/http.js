var events = require("events");
var util = require("util");


//enum generator
var next = 0;
function n(){
    return next++;
}

//states
var readingMethod = n();
var readingUrl = n();
var readingStatusMessage = n();
var readingStatusCodeStart = n();
var readingStatusCode = n();
var readingMajorVersion = n();
var readingMajorVersionH = n();
var readingMajorVersionT = n();
var readingMajorVersionT2 = n();
var readingMajorVersionP = n();
var readingMajorVersionSlash = n();
var readingMinorVersion = n();
var readingMinorVersionDot = n();
var readingNextLineCR = n();
var readingNextLineLF = n();
var readingHeaderNameStart = n();
var readingHeaderName = n();
var readingHeaderSeparator = n();
var readingHeaderValueStart = n();
var readingHeaderValue = n();
var readingBodyLF = n();
var readingBody = n();
var protocolError = n();


//httpParser class
function httpParser(stream, isRequest){
    var self = new events.EventEmitter();
    

    var majorVersion = 1;
    var minorVersion = 1;
    self.httpVersion = 1.1;
    self.headers = {};
    self.connection = stream;
    
    if(isRequest){
        self.method = "";
        self.url = "";        
    }else{
        self.statusCode = "";
        self.statusMessage = "";        
    }
    
    self.readable = true;
    self.pipe = function(target){
        util.pump(self,target);
        return target;
    }
    self.pause = stream.pause;
    self.resume = stream.resume;

    
    var headerName = "";
    var headerValue = "";
    
    var state = isRequest?readingMethod:readingMajorVersionH;
    
    stream.on("data",function(d){

        if(state == readingBody){
            self.emit("data",d);
            return;
        }
        var ascii = d.toString("binary");
        
        for(var i = 0; i < d.length; i++){
            var c = ascii[i];
            //console.log("charcode",c.charCodeAt(0),/*"char",c,*/"state",state);
            switch(state){
                case readingMethod:
                    if(c == " "){
                        state = readingUrl;
                    }else{
                        self.method += c;
                    }
                    break;
                case readingUrl:
                    if(c == " "){
                        state = readingMajorVersionH;
                    }else{
                        self.url += c;
                    }
                    break;
                case readingStatusCodeStart:
                    if(c == " "){
                        state = readingStatusCode;
                    }else{
                        error("protocol error");
                    }
                    break;
                case readingStatusCode:                
                    switch(self.statusCode.length){
                        case 0:
                            if("123456789".indexOf(c) >= 0){
                                self.statusCode += c;
                            }else{
                                error("protocol error");
                            }
                            break;
                        case 1:
                        case 2:
                            if("0123456789".indexOf(c) >= 0){
                                self.statusCode += c;
                            }else{
                                error("protocol error");
                            }
                            break;
                        case 3:
                            if(c == " "){
                                self.statusCode = parseInt(self.statusCode,10);
                                state = readingStatusMessage;
                            }else{
                                error("protocol error");
                            }
                            break;
                    }                   
                    break;
                
                case readingStatusMessage:
                    if(c == "\r" || c == "\n"){
                        state = c=="\r"?readingNextLineCR:readingNextLineLF;
                        i--;
                    }else{
                        self.statusMessage += c;
                    }
                    break;
                
                case readingMajorVersionH:
                    if(c == "H"){
                        state = readingMajorVersionT;
                    }else{
                        error("protocol error");
                    }
                    break;
                case readingMajorVersionT:
                case readingMajorVersionT2:
                    if(c == "T"){
                        state = state==readingMajorVersionT?readingMajorVersionT2:readingMajorVersionP;
                    }else{
                        error("protocol error");
                    }
                    break;
                case readingMajorVersionP:
                    if(c == "P"){
                        state = readingMajorVersionSlash;
                    }else{
                        error("protocol error");
                    }
                    break;
                case readingMajorVersionSlash:
                    if(c == "/"){
                        state = readingMajorVersion;
                    }else{
                        error("protocol error");
                    }
                    break;
                case readingMajorVersion:
                case readingMinorVersion:
                    if("0123456789".indexOf(c) >= 0){
                        if(state == readingMajorVersion){
                            majorVersion = parseInt(c,10);
                            state = readingMinorVersionDot;
                        }else{
                            minorVersion = parseInt(c,10);
                            self.httpVersion = majorVersion+minorVersion*0.1;
                            if(isRequest){                                
                                state = readingNextLineCR;
                            }else{
                                state = readingStatusCodeStart;
                            }
                        }
                    }else{
                        error("protocol error");
                    }
                    break;
                case readingMinorVersionDot:
                    if(c == "."){
                        state = readingMinorVersion;
                    }else{
                        error("protocol error");
                    }
                    break;
                case readingNextLineCR:
                    if(c == "\r"){
                        state = readingNextLineLF;
                        break;
                    }else if(c == "\n"){
                        state = readingNextLineLF;
                        i--;
                        break;
                    }else{
                        error("protocol error");
                    }
                    break;
                case readingNextLineLF:
                    if(c == "\n"){
                        state = readingHeaderNameStart;
                    }else{
                        error("protocol error");
                    }
                    break;
                case readingHeaderNameStart:
                    if(c == "\r"){
                        state = readingBodyLF;
                    }else if(c == "\n"){
                        open();
                    }else{
                        i--;
                        state = readingHeaderName;
                    }
                    break;
                case readingHeaderName:
                    if(c == " "){
                        state = readingHeaderSeparator;
                    }else if(c == ":"){
                        state = readingHeaderValueStart;
                    }else{
                        headerName += c;
                    }
                    break;
                case readingHeaderSeparator:
                    if(c == ":"){
                        state = readingHeaderValueStart;
                    }else if(c != " "){
                        error("protocol error");
                    }
                    break;
                case readingHeaderValueStart:
                    if(c != " "){
                        i--;
                        state = readingHeaderValue;
                    }
                    break;
                case readingHeaderValue:
                    if(c == "\r" || c == "\n"){
                        state = (c == "\r")?readingNextLineLF:readingHeaderName;                        
                        self.headers[headerName.toLowerCase()] = headerValue;                        
                        headerName = "";
                        headerValue = "";
                    }else{
                        headerValue += c;
                    }
                    break;
                case readingBodyLF:
                    if(c == "\n"){
                        open();
                    }else{
                        error("protocol error");
                    }
                    break;
                case readingBody:
                    self.emit("data",d.slice(i));
                    return;                    
                
            }
            if(state == protocolError){
                return;
            }            
        }
        
    });
    
    
    function open(){
        state = readingBody;
        if(isRequest){
            self.emit("open",new httpResponse(stream));
        }else{
            self.emit("open");
        }
    }
    stream.on("close",function(){
        self.emit("end");
        self.emit("close");
    });
    
    function error(msg){
        state = protocolError;
        self.emit("error",msg);
        self.emit("end");
        self.emit("close");
        stream.removeAllListeners();        
    }

    return self;    
}

function httpResponse(c){
    var res = new events.EventEmitter();
    res._headers = {};
    res.statusCode = 200;
    res.reasonPhrase = "OK";
    res.majorVersion = 1;
    res.minorVersion = 1;
    res.connection = c;
    res.writable = true;
    
    var headerWritten = false;
    res.writeHead = function(statusCode,reason,headers){
        if(!headerWritten){
            if(statusCode){
                res.statusCode = statusCode;
            }
            if(typeof reason == "string"){
                res.reasonPhrase = reason;
                if(headers){
                    res._headers = headers;
                }
            }else if(reason){
                res._headers = headers;
            }
            try{
                c.write("HTTP/"+res.majorVersion+"."+res.minorVersion+" "+res.statusCode+" "+res.reasonPhrase+"\r\n");
                for(var h in res._headers){
                    c.write(h+": "+res._headers[h]+"\r\n");
                }
                c.write("\r\n");
            }catch(e){
            }
            headerWritten = true;
        }
    }
    res.write = function(a,b){
        res.writeHead();
        try{
            c.write(a,b);
        }catch(e){
        }
    }
    res.end = function(a,b){
        res.writeHead();
        try{
            c.end(a,b);
        }catch(e){
        }
    }
    res.setHeader = function(key,value){
        res._headers[key.toLowerCase()] = value;
    }
    res.getHeader = function(key){
        return res._headers[key.toLowerCase()];
    }
    res.removeHeader = function(key){
        delete res._headers[key.toLowerCase()];
    }
    
    return res;
}


exports.httpParser = httpParser;
exports.httpResponse = httpResponse;