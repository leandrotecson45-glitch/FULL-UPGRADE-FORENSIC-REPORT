// Admin login
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginMsg = document.getElementById("loginMsg");
const loginDiv = document.getElementById("loginDiv");
const mainPanel = document.getElementById("mainPanel");

loginBtn.onclick = function(){
  if(usernameInput.value === "admin" && passwordInput.value === "password"){
    loginDiv.style.display = "none";
    mainPanel.style.display = "block";
  } else { loginMsg.textContent = "Invalid credentials"; }
}

// History array
let history = [];

// Image upload & ELA
document.getElementById("imageInput").addEventListener("change", function(e){
  const file = e.target.files[0];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = function(ev){
    const img = new Image();
    img.src = ev.target.result;
    img.onload = function(){
      const oCanvas = document.getElementById("originalCanvas");
      oCanvas.width = img.width; oCanvas.height = img.height;
      const oCtx = oCanvas.getContext("2d");
      oCtx.drawImage(img,0,0);

      const eCanvas = document.getElementById("elaCanvas");
      eCanvas.width = img.width; eCanvas.height = img.height;
      const eCtx = eCanvas.getContext("2d");

      const recompress = document.createElement("canvas");
      recompress.width = img.width; recompress.height = img.height;
      recompress.getContext("2d").drawImage(img,0,0);
      const tmpImg = new Image();
      tmpImg.src = recompress.toDataURL("image/jpeg",0.7);
      tmpImg.onload = function(){
        eCtx.drawImage(tmpImg,0,0);

        const oData = oCtx.getImageData(0,0,img.width,img.height);
        const rData = eCtx.getImageData(0,0,img.width,img.height);
        const diffData = eCtx.createImageData(img.width,img.height);
        let suspiciousPixels = 0;
        for(let i=0;i<oData.data.length;i+=4){
          let diff = Math.abs(oData.data[i]-rData.data[i])+
                     Math.abs(oData.data[i+1]-rData.data[i+1])+
                     Math.abs(oData.data[i+2]-rData.data[i+2]);
          let intensity = diff*4;
          if(intensity>200) suspiciousPixels++;
          diffData.data[i]=intensity;
          diffData.data[i+1]=0;
          diffData.data[i+2]=0;
          diffData.data[i+3]=255;
        }
        eCtx.putImageData(diffData,0,0);

        // EXIF
        EXIF.getData(img,function(){
          const meta = EXIF.getAllTags(this);
          analyzeResult(meta,file,suspiciousPixels,img.width*img.height,eCanvas.toDataURL("image/png"));
        });
      }
    }
  }
  reader.readAsDataURL(file);
});

// GPS converter
function convert(gps, ref){
  let d=gps[0], m=gps[1], s=gps[2];
  let val = d + m/60 + s/3600;
  if(ref=="S"||ref=="W") val*=-1;
  return val;
}

// Analyze & push history
function analyzeResult(meta,file,suspicious,totalPixels,elaDataUrl){
  let risk=0; let html="";

  if(!meta || Object.keys(meta).length===0){html+="<p>⚠ No metadata found.</p>"; risk+=50;}
  if(meta.Software){html+="<p><b>Software:</b> "+meta.Software+"</p>"; if(/photoshop|lightroom|snapseed|gimp|canva/i.test(meta.Software)) risk+=40;}
  if(!meta.GPSLatitude){html+="<p>⚠ No GPS Data</p>"; risk+=20;}

  const elaRatio = suspicious/totalPixels;
  if(elaRatio>0.05){html+="<p class='high'>⚠ High ELA anomaly detected.</p>"; risk+=40;}
  else if(elaRatio>0.02){html+="<p class='medium'>⚠ Moderate ELA anomaly.</p>"; risk+=20;}

  let level="LOW RISK"; let className="low";
  if(risk>=70){level="HIGH RISK – Likely Manipulated"; className="high";}
  else if(risk>=35){level="MEDIUM RISK – Needs Review"; className="medium";}

  html+="<hr><h3 class='"+className+"'>"+level+"</h3>";
  html+="<p><b>Tamper Probability:</b> "+Math.min(risk,100)+"%</p>";
  document.getElementById("result").innerHTML=html;

  history.push({
    name:file.name,
    risk:Math.min(risk,100),
    time:new Date().toLocaleString(),
    metadata:meta,
    elaDataUrl:elaDataUrl,
    originalDataUrl:document.getElementById("originalCanvas").toDataURL("image/png") // ✅ Original thumbnail
  });

  updateHistory();
}

// Update history UI
function updateHistory(){
  const ul=document.getElementById("history");
  ul.innerHTML="";
  history.forEach(h=>{
    const li=document.createElement("li");
    li.textContent=`${h.time} - ${h.name} - Risk: ${h.risk}%`;
    ul.appendChild(li);
  });
}

// Full PDF with summary + original + ELA thumbnails
const { jsPDF } = window.jspdf;

document.getElementById("downloadPdfBtn").addEventListener("click", function () {

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true
  });

  function compressCanvas(canvas) {

    // 🔥 FIXED SMALL SIZE (hindi percentage)
    const targetWidth = 800; // fixed width
    const scale = targetWidth / canvas.width;

    const smallCanvas = document.createElement("canvas");
    const ctx = smallCanvas.getContext("2d");

    smallCanvas.width = targetWidth;
    smallCanvas.height = canvas.height * scale;

    ctx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);

    // 🔥 VERY COMPRESSED JPEG
    return smallCanvas.toDataURL("image/jpeg", 0.4);
  }

  const originalCanvas = document.getElementById("originalCanvas");
  const elaCanvas = document.getElementById("elaCanvas");

  const originalImg = compressCanvas(originalCanvas);
  const elaImg = compressCanvas(elaCanvas);

  doc.text("Image Analysis Report", 20, 15);

  doc.addImage(originalImg, "JPEG", 20, 20, 170, 60);
  doc.addImage(elaImg, "JPEG", 20, 90, 170, 60);

  doc.save("analysis-report.pdf");

});
