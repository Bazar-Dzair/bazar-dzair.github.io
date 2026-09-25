// =============================================================
// Bazar Dzair — Admin Panel: التهيئة الأولية (سكريبت كلاسيكي عادي)
// تم فصل هذا الملف من admin.html (كان داخل <script> غير-module الأول)
// بدون أي تعديل على المنطق — فقط نقل المحتوى لملف خارجي.
// يُحمَّل ويُنفَّذ في نفس المكان بالضبط (سكريبت غير مؤجل)، فبقي ترتيب
// التنفيذ والنطاق العام (global scope) كما كان تمامًا.
// ملاحظة: settingDefinitions انتقل لـ admin-config.js (يُحمَّل قبل هذا
// الملف)، فبقي الاسم وصول عادي بلا أي تغيير فالاستعمال أسفله.
// =============================================================

function updateAdminUrl(name, createNew=false){
  try{
    const url=new URL(window.location.href);
    if(name && name!=="dashboard") url.searchParams.set("view",name);
    else url.searchParams.delete("view");
    // A new product has no product id; editing a product may set it separately.
    if(name!=="product" || createNew) url.searchParams.delete("id");
    if(name!=="order-detail") url.searchParams.delete("order");
    window.history.pushState({adminView:name},"",url.pathname+(url.search?url.search:"")+url.hash);
  }catch(e){}
}

function showView(name, el, createNew=false, updateUrl=true){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  const target=document.getElementById("view-"+name);
  if(target) target.classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));
  if(el) el.classList.add("active");
  if(name==="dashboard"){ if(window.bazarLoadDashboardStats) window.bazarLoadDashboardStats(); if(window.bazarLoadProducts) window.bazarLoadProducts(); }
  if(name==="products" && window.bazarLoadProducts) window.bazarLoadProducts();
  if(name==="product" && createNew && typeof resetForm==="function") resetForm();
  if(name==="product" && !createNew && window.bazarLoadProducts) window.bazarLoadProducts();
  if(name==="orders" && window.bazarLoadOrders) window.bazarLoadOrders();
  if(name==="reviews" && window.bazarLoadReviews) window.bazarLoadReviews();
  if(name==="blocked"){ if(window.bazarLoadBlockedPhones) window.bazarLoadBlockedPhones(); if(window.bazarLoadBlockedIps) window.bazarLoadBlockedIps(); }
  if(name==="fraud" && window.bazarLoadFraudAlerts) window.bazarLoadFraudAlerts();
  if(name==="shipping-rates" && window.bazarLoadShippingRates) window.bazarLoadShippingRates();
  if(name==="addons" && window.bazarLoadAddons) window.bazarLoadAddons();
  if(name==="footer") setTimeout(loadFooterSetting,0);
  try{sessionStorage.setItem("bazarAdminView",name);}catch(e){}
  if(updateUrl) updateAdminUrl(name,createNew);
  if(window.innerWidth<=1100){document.getElementById("sidebar")?.classList.remove("open");document.getElementById("sidebarBackdrop")?.classList.remove("open");}
}

// Keep the dashboard state in the browser URL so each admin section can be
// refreshed, bookmarked, or opened with Back/Forward without returning to /admin.
window.addEventListener("popstate",()=>{
  try{
    const params=new URLSearchParams(window.location.search);
    let view=params.get("view")||"dashboard";
    const valid=["dashboard","orders","reviews","product","products","categories","shipping-rates","sections","footer","users","settings","addons","order-detail","blocked","fraud"];
    if(!valid.includes(view)) view="dashboard";
    const ordersNavItem=document.querySelector('.nav-item[onclick*="orders"]');
    if(view==="order-detail"){
      const oid=params.get("order");
      const o=(window.adminOrders||[]).find(x=>x.id===oid);
      if(o){ renderOrderDetail(o); showView("order-detail",ordersNavItem,false,false); }
      else { showView("orders",ordersNavItem,false,false); }
      return;
    }
    const navItem=document.querySelector('.nav-item[data-view="'+view+'"]');
    // نفس منطق appPage(): صفحة منتج بلا معرّف = صفحة إنشاء منتج جديد ويجب أن تبدأ فارغة.
    let createNew=false;
    if(view==="product"){
      const hasId=!!params.get("id")||!!sessionStorage.getItem("bazarEditingProduct");
      createNew=!hasId;
    }
    showView(view,navItem,createNew,false);
  }catch(e){}
});
function toggleSidebar(){document.getElementById("sidebar")?.classList.toggle("open");document.getElementById("sidebarBackdrop")?.classList.toggle("open")}

const footerSettingDefaults={
 description:"متجر إلكتروني جزائري يوفر منتجات متنوعة، أسعار مناسبة وخدمة توصيل سريعة وآمنة.",
 customerLinks:["❓ أسئلة شائعة","📦 تتبع الطلب","🚚 سياسة التوصيل"],
 customerTexts:["","","نوفر التوصيل إلى مختلف ولايات الجزائر عبر Noest وDHD، سواء إلى المنزل أو إلى المكتب حسب توفر الخدمة.\n\nتختلف تكلفة التوصيل حسب الولاية وطريقة الاستلام، وتظهر للزبون عند تأكيد الطلب.\n\nمدة التوصيل تقديرية وقد تختلف حسب الولاية وشركة التوصيل.\n\nفي حالة رفض أو عدم استلام الطلب، قد تُطبق رسوم الإرجاع حسب شركة التوصيل."],
 importantLinks:["من نحن","سياسة الخصوصية","الشروط والأحكام"],
 importantTexts:["","",""] ,
 whatsappText:"💬 واتساب متوفر للطلبات", copyright:"© 2026 Bazar Dzair - جميع الحقوق محفوظة"
};
function footerEsc(v){return escapeAttr(String(v??""));}
function footerTextEsc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function footerField(label,id,value,textarea=false,cls=""){return textarea?`<label>${label}<textarea class="${cls}" id="${id}" rows="5" placeholder="اكتب النص الذي يظهر أسفل العنوان">${footerTextEsc(value)}</textarea></label>`:`<label>${label}<input class="${cls}" id="${id}" type="text" value="${footerEsc(value)}"></label>`}
function renderFooterAdminLinks(type,titles,texts){
 const container=document.getElementById(type==="customer"?"customerFooterAdminLinks":"importantFooterAdminLinks");
 if(!container)return;
 container.innerHTML=(titles||[]).map((title,i)=>`<div class="footer-admin-item" data-footer-admin-type="${type}" data-footer-admin-index="${i}"><div class="footer-admin-item-head"><span class="footer-admin-item-badge">🏷 العنوان ${i+1}</span><button type="button" class="footer-admin-delete" onclick="deleteFooterAdminLink('${type}',${i})">🗑️ حذف هذا العنوان</button></div>${footerField("العنوان",`${type}Title${i}`,title||false,false,`${type}-title`)}${footerField("النص الذي يظهر أسفل العنوان",`${type}Text${i}`,texts?.[i]||"",true,`${type}-text`)}</div>`).join("");
}
function addFooterAdminLink(type){
 const titles=Array.from(document.querySelectorAll(`.${type}-title`)).map(x=>x.value);
 const texts=Array.from(document.querySelectorAll(`.${type}-text`)).map(x=>x.value);
 titles.push(""); texts.push(""); renderFooterAdminLinks(type,titles,texts);
 setTimeout(()=>document.querySelector(`#${type}FooterAdminLinks .${type}-title:last-of-type`)?.focus(),0);
}
function deleteFooterAdminLink(type,index){
 const titles=Array.from(document.querySelectorAll(`.${type}-title`)).map(x=>x.value);
 const texts=Array.from(document.querySelectorAll(`.${type}-text`)).map(x=>x.value);
 if(titles.length<=1){alert("يجب أن يبقى عنوان واحد على الأقل.");return;}
 titles.splice(index,1); texts.splice(index,1); renderFooterAdminLinks(type,titles,texts);
}
async function loadFooterSetting(){
 const status=document.getElementById("footerAdminStatus");
 try{
   let remote={};
   try{remote=await getRemoteSetting("footer");}catch(_e){}
   let local={}; try{local=JSON.parse(localStorage.getItem("bazarFooterSettings")||"{}");}catch(_e){}
   const d={...footerSettingDefaults,...local,...remote};
   const c=[...(d.customerLinks||[])]; const ct=[...(d.customerTexts||[])]; const im=[...(d.importantLinks||[])]; const it=[...(d.importantTexts||[])];
   document.getElementById("footerAdminForm").innerHTML=`<div class="setting-form">
     <div class="footer-editor-card">
       <div class="footer-editor-card-head"><span class="fec-ic">📝</span><h3>وصف المتجر</h3></div>
       <p class="footer-editor-card-sub">جملة قصيرة تعرّف بمتجرك، تظهر أعلى تذييل الموقع.</p>
       ${footerField("وصف المتجر","footerDescriptionInput",d.description,true)}
     </div>
     <div class="footer-editor-card">
       <div class="footer-editor-card-head"><span class="fec-ic">❓</span><h3>خدمة الزبائن</h3></div>
       <p class="footer-editor-card-sub">أسئلة وروابط مساعدة تظهر للزبون في عمود "خدمة الزبائن".</p>
       <div id="customerFooterAdminLinks"></div>
       <button type="button" class="footer-admin-add" onclick="addFooterAdminLink('customer')">＋ إضافة عنوان جديد</button>
     </div>
     <div class="footer-editor-card">
       <div class="footer-editor-card-head"><span class="fec-ic">🔗</span><h3>روابط مهمة</h3></div>
       <p class="footer-editor-card-sub">صفحات مثل "من نحن" و"سياسة الخصوصية" في عمود "روابط مهمة".</p>
       <div id="importantFooterAdminLinks"></div>
       <button type="button" class="footer-admin-add" onclick="addFooterAdminLink('important')">＋ إضافة عنوان جديد</button>
     </div>
     <div class="footer-editor-card">
       <div class="footer-editor-card-head"><span class="fec-ic">📞</span><h3>معلومات التواصل والنشر</h3></div>
       <p class="footer-editor-card-sub">تظهر أسفل التذييل: نص واتساب وسطر حقوق النشر (تم الاعتماد على واتساب فقط بدون رقم هاتف).</p>
       ${footerField("نص واتساب","footerWhatsappInput",d.whatsappText)}
       ${footerField("حقوق النشر","footerCopyrightInput",d.copyright)}
     </div>
   </div>`;
   renderFooterAdminLinks("customer",c,ct); renderFooterAdminLinks("important",im,it);
   if(status)status.classList.add("hidden");
 }catch(e){console.error(e); if(status){status.textContent="تعذر تحميل إعدادات التذييل";status.classList.remove("hidden");}}
}
async function saveFooterSetting(){
 const data={description:document.getElementById("footerDescriptionInput")?.value||"",customerLinks:Array.from(document.querySelectorAll(".customer-title")).map(x=>x.value),customerTexts:Array.from(document.querySelectorAll(".customer-text")).map(x=>x.value),importantLinks:Array.from(document.querySelectorAll(".important-title")).map(x=>x.value),importantTexts:Array.from(document.querySelectorAll(".important-text")).map(x=>x.value),whatsappText:document.getElementById("footerWhatsappInput")?.value||"",copyright:document.getElementById("footerCopyrightInput")?.value||""};
 try{localStorage.setItem("bazarFooterSettings",JSON.stringify(data));
   if(window.bazarDb&&window.bazarSetDoc&&window.bazarDoc) await window.bazarSetDoc(window.bazarDoc(window.bazarDb,"settings","footer"),{...data,updatedAt:window.bazarServerTimestamp?window.bazarServerTimestamp():new Date()},{merge:true});
   const st=document.getElementById("footerAdminStatus"); if(st){st.textContent="تم حفظ تذييل المتجر بنجاح ✅";st.classList.remove("hidden");st.className="status ok";}
 }catch(e){console.error(e); const st=document.getElementById("footerAdminStatus"); if(st){st.textContent="تم حفظ التعديلات على الجهاز. تعذر المزامنة مع Firebase.";st.className="status ok";st.classList.remove("hidden");}}
}
function renderSettings(){
  const grid=document.getElementById("settingsGrid");
  if(!grid)return;
  grid.innerHTML=settingDefinitions.map(([icon,title,desc,key],i)=>{
    const colors=["blue","green","yellow","orange","purple","cyan","teal","pink"];
    return `<button class="setting-card" onclick="openSetting('${key}')">
      <span class="setting-icon ${colors[i%colors.length]}">${icon}</span>
      <span class="setting-content"><h3>${title}</h3><p>${desc}</p></span>
      <span class="setting-arrow">‹</span>
    </button>`;
  }).join("");
}

const settingFields={
 general:[
   ["اسم المتجر","storeName","Bazar Dzair"],
   ["العملة","currency","DZD"],
   ["رقم الهاتف","phone",""],
   ["وصف المتجر","subtitle","متجر إلكتروني"]
 ],
 email:[
   ["SMTP Host","smtpHost",""],
   ["SMTP Port","smtpPort","587"],
   ["SMTP Username","smtpUser",""],
   ["SMTP Password","smtpPassword",""]
 ],
 cart:[
   ["السماح بتعديل الكمية","cartQuantity","true"],
   ["إظهار عداد السلة","cartCounter","true"],
   ["السماح بالحذف من السلة","cartRemove","true"]
 ],
 branding:[],
 shipping:[]
};
let activeSetting=null;
const wilayas = [
 "أدرار","الشلف","الأغواط","أم البواقي","باتنة","بجاية","بسكرة","بشار","البليدة","البويرة",
 "تمنراست","تبسة","تلمسان","تيارت","تيزي وزو","الجزائر","الجلفة","جيجل","سطيف","سعيدة",
 "سكيكدة","سيدي بلعباس","عنابة","قالمة","قسنطينة","المدية","مستغانم","المسيلة","معسكر","ورقلة",
 "وهران","البيض","إليزي","برج بوعريريج","بومرداس","الطارف","تندوف","تيسمسيلت","الوادي","خنشلة",
 "سوق أهراس","تيبازة","ميلة","عين الدفلى","النعامة","عين تموشنت","غرداية","غليزان","تيميمون",
 "برج باجي مختار","أولاد جلال","بني عباس","عين صالح","عين قزام","تقرت","جانت","المغير","المنيعة"
];
const legacyShippingPrices = {
 "01":1000,"02":600,"03":800,"04":600,"05":600,"06":600,"07":800,"08":950,"09":450,"10":550,
 "11":1200,"12":650,"13":600,"14":600,"15":550,"16":300,"17":800,"18":600,"19":600,"20":650,
 "21":600,"22":600,"23":600,"24":650,"25":600,"26":550,"27":650,"28":650,"29":600,"30":800,
 "31":600,"32":900,"33":1200,"34":600,"35":450,"36":650,"37":1100,"38":600,"39":800,"40":650,
 "41":650,"42":450,"43":650,"44":550,"45":800,"46":600,"47":800,"48":600,"49":1100,"50":"",
 "51":800,"52":1000,"53":1200,"54":"","55":800,"56":"","57":850,"58":850
};
// أسعار افتراضية أولية لتوصيل المكتب لكل الولايات الـ58 (تُستخدم فقط كقيمة بداية تظهر في جدول "أسعار التوصيل – المكتب"
// عند أول فتح للوحة التحكم قبل أي حفظ). بعد الحفظ من لوحة التحكم، تصبح القيم المحفوظة في settings/shipping (Firestore)
// هي المصدر الفعلي المستخدم في حساب تكلفة التوصيل، وتبقى قابلة للتعديل والحفظ في أي وقت لكل ولاية على حدة.
const legacyOfficeShippingPrices = {
 "01":500,"02":350,"03":450,"04":350,"05":350,"06":350,"07":450,"08":500,"09":450,"10":350,
 "11":700,"12":350,"13":350,"14":350,"15":350,"16":300,"17":450,"18":350,"19":350,"20":350,
 "21":350,"22":350,"23":350,"24":400,"25":350,"26":300,"27":400,"28":400,"29":350,"30":450,
 "31":350,"32":500,"33":700,"34":350,"35":250,"36":400,"37":650,"38":350,"39":450,"40":400,
 "41":400,"42":250,"43":400,"44":300,"45":450,"46":350,"47":450,"48":350,"49":650,"50":"",
 "51":450,"52":600,"53":700,"54":"","55":450,"56":"","57":500,"58":500
};






function escapeAttr(v){return String(v??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

async function getRemoteSetting(docName){
  try{
    if(window.bazarGetDoc && window.bazarDb){
      const snap=await window.bazarGetDoc(window.bazarDoc(window.bazarDb,"settings",docName));
      return snap.exists()?snap.data():{};
    }
  }catch(e){console.error(e)}
  return {};
}

async function openSetting(key){
  activeSetting=key;
  const def=settingDefinitions.find(x=>x[3]===key);
  document.getElementById("settingModalIcon").textContent=def?.[0]||"⚙";
  document.getElementById("settingModalTitle").textContent=def?.[1]||"الإعداد";
  document.getElementById("settingModalDesc").textContent=def?.[2]||"تعديل إعدادات المتجر";
  // openAddon() يستبدل أزرار هذه النافذة المشتركة بأزرار خاصة بالإضافات (saveAddon/closeAddon)
  // ولا يُعيدها أبدًا — فبدون هذا السطر، أي إعداد عادي (عام/بريد/سلة/شعار) يُفتح بعد إضافة واحدة
  // على الأقل يبقى بزر "حفظ" يستدعي saveAddon() بدل saveSetting() ولا يحفظ شيئًا فعليًا.
  document.querySelectorAll("#settingsModal .modal-actions").forEach(a=>{a.innerHTML='<button class="green" onclick="saveSetting()">💾 حفظ الإعدادات</button><button class="gray" onclick="closeSetting()">إلغاء</button>';});

  if(key==="branding"){
    const remote=await getRemoteSetting("site");
    document.getElementById("settingModalBody").innerHTML=`
      <div class="branding-box">
        <div class="brand-upload-card">
          <div class="upload-title">🖼️ شعار المتجر</div>
          <input id="logoFile" type="file" accept="image/*" onchange="previewBrandImage(this,'logoPreview')">
          <input id="logoUrl" data-brand-key="logoUrl" type="url" oninput="var i=document.getElementById('logoPreview');if(this.value.trim()){i.src=this.value.trim();i.style.display='block'}" placeholder="أو ضع رابط الشعار" value="${escapeAttr(remote.logoUrl||"")}">
          <div class="brand-actions"><button type="button" class="b-new" onclick="document.getElementById('logoFile').click()">📁 إضافة / تغيير</button><button type="button" class="b-del" onclick="removeBrandImage('logoFile','logoUrl','logoPreview')">🗑️ حذف</button></div>
          <img id="logoPreview" class="brand-preview" src="${escapeAttr(remote.logoUrl||"")}" ${remote.logoUrl?"":"style='display:none'"} alt="">
        </div>
        <div class="brand-upload-card">
          <div class="upload-title">🖼️ بانر المتجر</div>
          <input id="bannerFile" type="file" accept="image/*" onchange="previewBrandImage(this,'bannerPreview')">
          <input id="bannerUrl" data-brand-key="bannerUrl" data-orig="${escapeAttr(remote.bannerUrl||"")}" type="url" oninput="var i=document.getElementById('bannerPreview');if(this.value.trim()){i.src=this.value.trim();i.style.display='block'}" placeholder="أو ضع رابط البانر" value="${escapeAttr(remote.bannerUrl||"")}">
          <div class="brand-actions"><button type="button" class="b-new" onclick="document.getElementById('bannerFile').click()">📁 إضافة / تغيير</button><button type="button" class="b-del" onclick="removeBrandImage('bannerFile','bannerUrl','bannerPreview')">🗑️ حذف</button></div>
          <img id="bannerPreview" class="brand-preview banner-preview" src="${escapeAttr(remote.bannerUrl||"")}" ${remote.bannerUrl?"":"style='display:none'"} alt="">
        </div>
        <small class="hint">يمكنك رفع الصورة مباشرة أو استعمال رابط صورة. بعد الحفظ ستظهر في المتجر.</small>
      </div>`;
  }else{
    const docName=key;
    const remote=await getRemoteSetting(docName);
    const saved={...JSON.parse(localStorage.getItem("bazarSettings")||"{}"),...remote};
    const fields=settingFields[key]||[];
    document.getElementById("settingModalBody").innerHTML=`<div class="setting-form">${fields.map(([label,name,defaultVal])=>{
      const val=saved[name] ?? defaultVal;
      const isBool=val==="true" || defaultVal==="true" || defaultVal==="false";
      if(isBool) return `<div class="toggle-row"><label for="sf_${name}" style="margin:0">${label}</label><input id="sf_${name}" data-key="${name}" type="checkbox" ${String(val)==="true"?"checked":""}></div>`;
      const type=name.toLowerCase().includes("port")?"number":"text";
      return `<label>${label}<input id="sf_${name}" data-key="${name}" type="${type}" value="${escapeAttr(val)}"></label>`;
    }).join("")}</div>`;
  }
  document.getElementById("settingsModal").classList.remove("hidden");
}

function removeBrandImage(fileId,urlId,prevId){
  const f=document.getElementById(fileId),u=document.getElementById(urlId),p=document.getElementById(prevId);
  if(f)f.value="";if(u)u.value="";
  if(p){p.removeAttribute("src");p.style.display="none";}
  alert("تم تحديد الحذف — اضغط «حفظ الإعدادات» لتأكيده. سيعود الموقع للصورة الافتراضية.");
}
function previewBrandImage(input,id){
  const file=input.files?.[0],img=document.getElementById(id);
  if(!file||!img)return;
  img.src=URL.createObjectURL(file);img.style.display="block";
}
async function uploadBrandFile(input,path,maxSide){
  const file=input?.files?.[0];
  if(!file)return "";
  // ⚠️ إصلاح 17/09/2026: كانت هذه الدالة ترفع الشعار/البانر عبر Firebase Storage
  // (getStorage/uploadBytes) — لكن مشروع Firebase هنا على خطة Spark المجانية بلا
  // Firebase Storage (يتطلب خطة Blaze)، فكانت كل محاولة رفع شعار أو بانر تفشل. بقية
  // صور المنتجات فالموقع (admin.html نفسه) ترفع فعليًا عبر Cloudinary — نستعمل نفس
  // الآلية هنا عوض Firebase Storage.
  if(!window.bazarUploadToCloudinary||!window.bazarCompressImage) throw new Error("خدمة رفع الصور غير جاهزة");
  const blob=await window.bazarCompressImage(file,maxSide||1200,0.82);
  return await window.bazarUploadToCloudinary(blob);
}
function closeSetting(){document.getElementById("settingsModal").classList.add("hidden");activeSetting=null}

async function saveSetting(){
  let seoNote="";
  try{
    if(!window.bazarDb||!window.bazarSetDoc||!window.bazarDoc) throw new Error("Firebase غير جاهز");

    if(activeSetting==="branding"){
      const saveBtn=document.querySelector("#settingsModal .modal-actions .green");
      if(saveBtn){saveBtn.disabled=true;saveBtn.textContent="⏳ جارٍ رفع الصور...";}
      let logoUrl=document.getElementById("logoUrl")?.value.trim()||"";
      let bannerUrl=document.getElementById("bannerUrl")?.value.trim()||"";
      const logoFile=await uploadBrandFile(document.getElementById("logoFile"),"site/logo",600);
      const bannerFile=await uploadBrandFile(document.getElementById("bannerFile"),"site/banner",1600);
      if(logoFile)logoUrl=logoFile;
      if(bannerFile)bannerUrl=bannerFile;
      const bannerBefore=document.getElementById("bannerUrl")?.dataset.orig||"";
      await window.bazarSetDoc(window.bazarDoc(window.bazarDb,"settings","site"),{
        logoUrl,bannerUrl,updatedAt:window.bazarServerTimestamp()
      },{merge:true});
      // الحفظ في Firestore تم بنجاح هنا. إن تغيّر البانر نشغّل تحديث صفحات SEO فورًا (og:image + بانر الصفحة
      // الرئيسية) عبر الـ Worker بدل انتظار الـ cron. فشل هذه الخطوة لا يُلغي الحفظ، بل تظهر رسالة تنبيه فقط
      // والـ cron (كل 6 ساعات) يعوّض تلقائيًا.
      if(bannerUrl!==bannerBefore){
        if(saveBtn)saveBtn.textContent="⏳ جارٍ تحديث صفحات SEO...";
        let seo;
        try{seo=await window.bazarTriggerSeo();}catch(e){seo={ok:false,message:"خطأ غير متوقع"};}
        seoNote=seo&&seo.ok
          ?"\n🔄 بدأ تحديث صفحات SEO الآن، ويظهر التحديث في الموقع خلال دقائق."
          :"\n⚠️ لكن تعذر تشغيل تحديث SEO فورًا ("+((seo&&seo.message)||"سبب غير معروف")+"). سيُحدَّث تلقائيًا خلال 6 ساعات كحد أقصى.";
      }
    }else{
      const data={};
      document.querySelectorAll("#settingModalBody [data-key]").forEach(el=>data[el.dataset.key]=el.type==="checkbox"?el.checked:el.value);
      await window.bazarSetDoc(window.bazarDoc(window.bazarDb,"settings",activeSetting),{...data,updatedAt:window.bazarServerTimestamp()},{merge:true});
      const saved=JSON.parse(localStorage.getItem("bazarSettings")||"{}");
      Object.assign(saved,data);localStorage.setItem("bazarSettings",JSON.stringify(saved));
    }
    closeSetting();
    alert("تم حفظ الإعدادات بنجاح ✅"+seoNote);
  }catch(e){
    console.error(e);
    const b=document.querySelector("#settingsModal .modal-actions .green");
    if(b){b.disabled=false;b.textContent="💾 حفظ الإعدادات";}
    alert("تعذر حفظ الإعدادات: "+e.message);
  }
}

renderSettings();

// ================= أسعار التوصيل (58 ولاية المعتمدة في المتجر) =================
const carrierLogos={"dhd":"data:image/png;base64,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","noest":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAPx0lEQVR42u2beXRUVbbGf+cOlRpSqYyAAZIQgiQQkCgIMik4IA6N7fO1iiiiPltwXm2Lb2kLrlbURm3F8bVDowsHkG6VVkRbBcUBHBgTgUCYQ8hclUrN957z/qgkDUqvpySgb8lZq/6oVbfqnP3t7+zz7b1PCaWU4hc8NH7h4xgAxwA4BsAxAI4B8EsextGcTCmFVIqk9BDf/RQhBJoQCCGO2prE0RBCtpQA6Jr2A59XgPrBz/9sAbClPMiI+qYm1m7exaYd+9m9v5nWYBilCbweJ3ndMxjQJ5eykgKyM9PbSYGt5BEF4ohsAQVImfSgVJKlH6/hpSWfsWLdNurrA5CwklugnepKgZJgGnTrlsGpZYVccf5ozhlbhq7p2FKiaRri/wMDpFJobYYt+2wNf3x6CZ+v3ZGExZWCYRoHGNI+tej4rp2wIBoHJKeUFTJ7+oWcNWpIRwzp6vjQpQC0LzAej3Hb3Jd5/NXloOkYqS4EYNs2/9dsQogkc1DYoRgomxsvGcfc2y4lJcWJlApNEz8/ANoXtrPOz5W3P8HHX2xCz/AmDW8Lgj926JqGAuymIONG9WfRIzeRnZF+EMt+HjqgzfOJWJS//vk5Pl5TCV4PSkqUkp0KolJKHDk+lq/awrkzHqY5EEQg6Cridp4BSoFSWErxyeRpWLX7CI0dx4LdUd7e3EA8lkB3aIBAdmIq0zSIN7Uwcfwglsz7HUJoXRIYO80AJRVoGhsfmcf+RYtpWVuBa+EiZroDvHBmb8YXZmErgZ1IoLXt8cMZiYSFIyONd99fxwN/XZKME1L+tAxQUiKEoGHLVj4aeQaGUKDrWNEo0pbkDB5I+piT+dxy8dwWPxtqIyAlhkNHKsmPnVkIEBIcKL5ZeDfFfXqjVOeCYucYoEAJwaa5f0a2+MHQUbaN7nDgcLtoWF/BjvkLGbqrkmdOTOfOIRnkZ6diWQppSQxDR7RJX/EDd5tmaERao9z7/NsIAQr10zBASYnQNJqrqvhgxDg0W4LQDjjbQWgaSkqsWILU4/vR64wxNGo6r+2Ls2h3mMC+RnA6k27QBGgaQmvLBdShTRNtwKfosH7RLPrl9ezUqXD4DJDJ5e15cylWYzPCNL9nPEKgEhYqHqV+7So2PPkXUsNh7hnVl6UXDeDma86mrH8PBh/fk/zcLHxeZ/KnE3GkLf+tytRNnYg/zN/f/6rjCD7qUljoGgpF3fsfoDkcSSnbtlGFpmEFW0nYCVIK8uk9eiQFZ43DU9gHPwblwsH2jZUMy8sky+tm+946IpEYGhLd1Gn0h6jYUc/e5hDqEJ5VUiEMnaVflDPzmgvQOxEDDg8ApUAIwo2NtGytQk9xJLeEriPjcRKhMOljTqHPtdPof+Ekwo4U3li+jldfX8mnX22mINPLiBP78c07q6muC3DWqSfwH+eNxefzsHp1OXtSGgmGbBpDMcJx6185Qwf5JCrFZPPOWpr9LWSkpx22TDYOz/7kZOG91VhNzeiGgdAN7NZW8KUz+JEHOf6qyzGAV979jNmPLWbr1n24MtM4b+wATuifx/sry9ENgy9eu4f8nt2pfXcpu1ftYX1VhL8tWwO6QE91fc/4DvwNnQZ/mF376tsAOOSjR5ABQKy+ARmNYKanE28J4Czqy8jXXiJnQDEoyc33Pc+8lz6CVA+a18m7T91CdkYqgy+4C2lJNrwzh/ye3dn0xhLsWJSG9z7kztL+jPnt6cx5bxN1O6sxfB7sQ8QDTQjseIL9/lBbbDhUkeUIH4PxSBQhNWQ0iqNXLmOXLGozXnHXk68zb/6HmDkZCGUxc9oE1lRsY/w1c5ESRo4oYVDffAL7alg/5Wr8yz6g9M7b2L9uI8O//Ccvju/F6NOGYDUH0cX3BZRIJhlEI9GDE8ujCYBmGiiRLFoMe/4pMgoKULbk8/WVzPmfd0jploHVGuGkkjzm3DyZ4UOKqWsIIAwdX6oLpcC/eSuaprHnxQXsev4lBv/xbnZ+9AUsfI3H8myuu3Q8VjiGsuyDBY8CNA3dNA7MqI8SAG3ecOdkk4gH6XXl5fQaMwY7kUDoGg+9+C7KVkkdYNkUF/SgrjHAB6sqEEqhNJ3G5gBCgMOZAlLiPC6XXc8+S/3ylYxc+CJhaZNo8jM9sIXHbr2QFIeJHYmj6VpH7QBDJ9PnbrP/KOqAdjo6snNw5uZRPONalFLohsn++iY+/LoS4XaSsCyE06S2sYXfPzifF978JCl8DI3KPQ3UBYJkFBdhZGVgh8O4u+VS8fs7MZxOjp96OfuWLGX3ugrK5j/Ggt/9iuxuGdgtIQxDR9o2Xk8K+d0yD/TJ0WVASnoava6aQkb/oqRHBFRsq6YlEEJrk7kqEuOGyWcy/8GbmDByECoUI8Vp4m8M8unqcpyZWXhPPgkrnDzzU9xuvr5yOv1umkFqUSHx7dtw/vpCMh99kNeuP4M+Rb1ItITQFBTkZpLbLfsgpxzVGODwplJ6643JnKDtZNhdWw8JK1neRoCCXdUNgKCsfwEo2UZXjQVLVwPQd+oVKKWBlGheD62bytk27xlOeWU+0eYmEpVbyZ5+LWrWLBbefC7FA/ORtU2MG1aCpmtY9uFnhZ0CQNd0vJmZbYRIeqAlHO2Qye2SeXt1HULAkJI8cOvELRst1cWyz8r5tmon+RPPIm3UcKyWIChweH1UPv4UptvD4Pvvp/KZecS37cLuV0TNlCksvO0i+g89nnNGlnaK/l1TEfpOk8Nhmh1vpZLgdPDp2m3UN/k5qTiP0n69kdEYpqERaY0x94Wl6IbOwFn/jUQkWeByEdu+k92L36D/f00lu/RkNs2+C3dODo7BZeyZNpW3Zl/GmJNKkrGnE2XzzgPQBn87BN3S00AXKBRSKoTTwdfb9tHn3JkUnT+Tqj0NoOskLBstzcMrS7/m6w2VFIw7ldyrLyPW1IhmGKAJ9v7tDUzTpM/VV6AJg3DlNka9/hLhUBxz61bcLid0sijSdR2HNgR698gA0+xYlyZARBOMGFzIZeeMYOLwYgxTaytkQDwh+f28xShpc8I9f8BZXILV0oKRmkpg/UZioRD5l/4GZ68iGj/6kMo/PcoZn7xP7oQzk/JX138eALTn44W9upOV6UPadkdkVghaWkPMufkS/vborZw7ohjVGkEAhtfFis++Zf6by/FlZ1P25CMklEAzdBK1DfgrKkntnkP2uFEgNPYs/jue7jk407wIOl8Y7TIAhEgWPbMzfAzpdxxaPIEmRLJD5HHy1dfbePXtlUgFd13zK0yHjpQKJSWax8Xtj73J7up9FJw2hpJ7/0DcH0BaCUJ7d4NS9Dh1NNI0Gfbs45hmMvukC0rjXdp0ay9MnD6sGBmKYph6e9kJnCk8/Mp7WIk4Q0uLuGLSKOxAK5om0B0GDfUBZsx5GWVbDLrlenpdexWRcAN2OAxCkDliGKe88To9R49GtBdcfjZ9gY5jMVmvv+yckfQv7U20zp/cBgIMj5Nv1mznr28sB2DW9AvI6eFDJmyUVJgZXt75YB2PLFiGDgx9+AGyho8mvK8GgKySYvqeM6HLPN+x5tmzZ8/uym0AkJ6WyqUTRxCMRFlbsQMrFEMaBqYzhS/Lt3PZ2SfTs3s2vlQHS979EiPVBVJiuh2sWFXOKYP70K+gJ1njxmGmpeEryOvoP4gu7hQfkfb4gdWZrzZW8sRr/+QfK8tpbgyDv4VfXzyW1+fehBAw6eZ5vL3sK/C4IBGHSIJBZYV88sJMfD4fR/qqROf6AkoljyLtX7mYlKqDofIAkVJd28CK1d+ycv1WNmzawUO3XcqIIQPYUV3DRbc+gdPtZFBhD047sZjRwwZwXLYPXdOSJXNN65jrkL2CTmyJI3pBQimFLRWG/n3axhNxHKbjh7YfjhgTOgVAoCVIfUMzfQpy0YROwrLYU12P251Cj26ZHTl6TW0jlmXTu2cOtDU2mwN+mpqDGIYDTdOwLBuv10OmLxVd12hsChBsjZCd4yPV5aIl2EpjUxCha0g7eWECpcjI9ODzeA8fIXUYI2HZSiml5r/1kTLyL1Qz7ntBKaXU3po65SibqiZe/yellFI7q2vVOTPuV5ROUZRcrkZOvlt9822VUkqp2x94SZnFlykGT1WUTFZ0/5Wa/fRipZRUM+57TnmGXakonaLMARerf6z4Ui1+e6Wi+/lKL7tKOYf/Vhll1yhyJ6lnFi49aE0/dnTqioxUYLlcPPXyckr79mTapNHELYWNDigm3/E0n39ezqzbLibN4+GOh15l0k2PU/XOgxiOFBKhGI/fOZkhJQW0BkMUF+Wz4qsKnpr3FtOuO5frLz6Df65cR95x3cj0ulj43B2sWF/J0y8s4+qpE5hwUn8GD8gDxWH3BoyuOPo0j4MbH3gFl8PE6XHidpps31vD5ys3csO15zP7uos6dMItv3uaLyu24XE7ELpgxdotlO+uw1YJHj55IE0treBz8t4nFaSaLs4bP5hBRb0Qms5vzuuGNOCZJ99kZFkR/3nuyANSkZ+gIIIAFY5yw4Wjyc7yMv3+BcTDMUzdIBKJgy3JyU7reLxHdjoCaA1Hk9UiobO9uokNldVUbNuPP9jKiQMK+XTRPZw+fABvfrKWCZfcy4x756OUxLIlwXAMJTRC4TiWLUlYdqdM6BQDDE1Hj1ucMbyUSeOGMX7a/WiajmVbFOXn0qMwl6cWfMDZIwbidTu57y9LEJlpDBtYyOp1O9ClYs6MCxh1YjGRWAynw8Heujq+WLOV2TMuoDkYYOy0h1ixditCCAw9eX9I15Mvo5PVoE4zIBZPYLcE2bu/iXHDB/LArb9B1jbT3BwkxeHg2dlXEAmHGf7rOxkw8XY2bdnNk7OmkJWeTkNDADseZ+INj5F2ynS6l07jrnmLqKlrZubcl+l71q0MveRe3IbivumTkHZSCcZjceymFmKx+E93DLYrve27a/jym80MH1pCQe8eCOCtFevwpXs4bUg/AGpDYVas2kQ0FmXs0GL6dMtCAuu27KSyqgbdYYCmY8XiFPbpwfDiAvyRCFt21hC3BcWFPchxuzrmrqptYtWqjQw9oYj+BT07fXWuy4TQ/g0baa6qwusw0dPS8O+vJdLkx+Vx4s1I9u6irTEcBQUEqqrI7pWLOzuL6P4aEqEwvuP74t9bTVQJXE4XdjAA0TjhYCuhmIXDZWC6PBCNkTdyGKmFRRx2Q7CrYoBSCtuy0Q0dy06AZuAPx1Gh/ehKYXo8JISgrtEP6Dg9XsxEnBSvB7N3b5qra2gNRpGRMIHyzSilSM3KJhpsJdIaRSQs3N27k6irQyAQDoOIv4nmQCtupdC6AADxS//XWNfdFT4QR/X9uzvt114O6bF/I/YP8s137xF1UU1AHPvf4C98HAPgGADHADgGwDEAfsnjfwHy56gaRWQy7wAAAABJRU5ErkJggg==","48hr":"data:image/png;base64,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"};
const homeCompanyLabels={dhd:"DHD Express",noest:"Noest Express","48hr":"48HR Express"};
const officeCompanyLabels={dhd:"DHD Express"};
function carrierOptionHtml(v,l,checked){
  const logo=carrierLogos[v]?`<img class="carrier-logo" src="${carrierLogos[v]}" alt="">`:"";
  return `<label><input type="checkbox" value="${v}" ${checked?"checked":""} onchange="updateMultiSelect(this)">${logo}<span>${l}</span></label>`;
}
function homeCompanyDisplay(val){
  const codes=(val||"").split(",").map(v=>v.trim()).filter(Boolean);
  if(!codes.length) return "اختر شركة";
  return codes.map(c=>homeCompanyLabels[c]||c).join(" + ");
}
window.toggleMultiSelect=function(btn){
  const wrap=btn.closest(".multi-select");
  const isOpen=wrap.classList.contains("open");
  document.querySelectorAll(".multi-select.open").forEach(el=>el.classList.remove("open"));
  if(!isOpen) wrap.classList.add("open");
};
window.updateMultiSelect=function(cb){
  const wrap=cb.closest(".multi-select");
  const checked=[...wrap.querySelectorAll('input[type="checkbox"]:checked')].map(c=>c.value);
  const val=checked.join(",");
  wrap.dataset.value=val;
  wrap.classList.toggle("empty",!checked.length);
  wrap.querySelector(".multi-select-btn").textContent=homeCompanyDisplay(val);
};
document.addEventListener("click",e=>{
  if(!e.target.closest(".multi-select")){
    document.querySelectorAll(".multi-select.open").forEach(el=>el.classList.remove("open"));
  }
});
(function initBulkHomeCompanyMenu(){
  const menu=document.querySelector("#bulkHomeCompanySelect .multi-select-menu");
  if(menu) menu.innerHTML=Object.entries(homeCompanyLabels).map(([v,l])=>carrierOptionHtml(v,l,false)).join("");
})();
let shippingRatesLoaded=false;
window.activeShippingTab="home";
const shippingExpanded={home:false,office:false};
const SHIPPING_COLLAPSE_COUNT=8;
window.switchShippingTab=function(tab){
  window.activeShippingTab=tab;
  const tabHome=document.getElementById("shippingTabHome"),tabOffice=document.getElementById("shippingTabOffice");
  const secHome=document.getElementById("shippingSectionHome"),secOffice=document.getElementById("shippingSectionOffice");
  if(tabHome)tabHome.classList.toggle("active",tab==="home");
  if(tabOffice)tabOffice.classList.toggle("active",tab==="office");
  if(secHome)secHome.classList.toggle("hidden",tab!=="home");
  if(secOffice)secOffice.classList.toggle("hidden",tab!=="office");
  const search=document.getElementById("shippingRatesSearch");
  if(search)search.value="";
  window.filterShippingRatesTable();
};
function applyShippingCollapse(type){
  const box=document.getElementById(type==="home"?"shippingRatesBodyHome":"shippingRatesBodyOffice");
  const btn=document.getElementById(type==="home"?"shippingMoreHome":"shippingMoreOffice");
  if(!box||!btn)return;
  const rows=Array.from(box.querySelectorAll(".shipping-rate-row"));
  const expanded=shippingExpanded[type];
  rows.forEach((row,i)=>{row.classList.toggle("row-more-hidden",!expanded&&i>=SHIPPING_COLLAPSE_COUNT);});
  if(rows.length>SHIPPING_COLLAPSE_COUNT){
    btn.style.display="";
    btn.textContent=expanded?"▲ عرض أقل":`▼ عرض المزيد (${rows.length-SHIPPING_COLLAPSE_COUNT} ولاية أخرى)`;
  }else{
    btn.style.display="none";
  }
}
window.toggleShippingMore=function(type){
  shippingExpanded[type]=!shippingExpanded[type];
  applyShippingCollapse(type);
};
let shippingRatesData={};
function shippingRateCode(i){return String(i+1).padStart(2,"0");}
function buildDefaultShippingRates(){
  const out={};
  wilayas.forEach((name,i)=>{
    const code=shippingRateCode(i);
    out[code]={home:legacyShippingPrices[code]??"",homeCompany:"dhd,noest,48hr",office:legacyOfficeShippingPrices[code]??"",officeCompany:"dhd",duration:""};
  });
  return out;
}
window.bazarLoadShippingRates=async function(force=false){
  const boxHome=document.getElementById("shippingRatesBodyHome");
  const boxOffice=document.getElementById("shippingRatesBodyOffice");
  if(!boxHome||!boxOffice)return;
  if(shippingRatesLoaded&&!force){renderShippingRatesTable();return;}
  boxHome.innerHTML='<div class="empty-card">⏳ جاري تحميل الأسعار...</div>';
  boxOffice.innerHTML='<div class="empty-card">⏳ جاري تحميل الأسعار...</div>';
  try{
    const remote=await getRemoteSetting("shipping");
    const defaults=buildDefaultShippingRates();
    const rates=remote.rates||{};
    shippingRatesData={};
    wilayas.forEach((name,i)=>{
      const code=shippingRateCode(i);
      shippingRatesData[code]={...defaults[code],...(rates[code]||{})};
      if(!shippingRatesData[code].homeCompany) shippingRatesData[code].homeCompany=defaults[code].homeCompany;
      if(!shippingRatesData[code].officeCompany) shippingRatesData[code].officeCompany=defaults[code].officeCompany;
    });
    shippingRatesLoaded=true;
    renderShippingRatesTable();
  }catch(e){
    console.error(e);
    boxHome.innerHTML='<div class="empty-card">❌ تعذر قراءة أسعار التوصيل من Firestore. تحقق من Firestore Rules.</div>';
    boxOffice.innerHTML='<div class="empty-card">❌ تعذر قراءة أسعار التوصيل من Firestore. تحقق من Firestore Rules.</div>';
  }
};
// نفس مصدر البيانات (shippingRatesData / settings/shipping في Firestore) يُعرض في قائمتين منفصلتين تمامًا:
// 🚚 باب الدار (DHD + NOEST + 48HR) — و — 🏢 المكتب (DHD EXPRESS). لا يوجد خلط بين السعرين أو الشركتين.
function renderShippingRatesTable(){
  const boxHome=document.getElementById("shippingRatesBodyHome");
  const boxOffice=document.getElementById("shippingRatesBodyOffice");
  if(!boxHome||!boxOffice)return;
  boxHome.innerHTML=wilayas.map((name,i)=>{
    const code=shippingRateCode(i);
    const r=shippingRatesData[code]||{home:"",homeCompany:"",duration:""};
    const selected=new Set((r.homeCompany||"").split(",").map(v=>v.trim()).filter(Boolean));
    return `<div class="shipping-rate-row cols-home" data-name="${escapeAttr(name)}" data-code="${code}">
      <div class="src-cell src-num">${code}</div>
      <div class="src-cell src-name">${escapeAttr(name)}</div>
      <div class="src-cell"><input type="number" min="0" step="50" data-field="home" data-code="${code}" value="${escapeAttr(r.home)}" placeholder="دج"></div>
      <div class="src-cell src-company">
        <div class="multi-select${selected.size?"":" empty"}" data-field="homeCompany" data-code="${code}" data-value="${escapeAttr(r.homeCompany||"")}">
          <button type="button" class="multi-select-btn" onclick="toggleMultiSelect(this)">${homeCompanyDisplay(r.homeCompany)}</button>
          <div class="multi-select-menu">
            ${Object.entries(homeCompanyLabels).map(([v,l])=>carrierOptionHtml(v,l,selected.has(v))).join("")}
          </div>
        </div>
      </div>
      <div class="src-cell"><input type="text" data-field="duration" data-code="${code}" value="${escapeAttr(r.duration)}" placeholder="مثال: 24-72 سا"></div>
    </div>`;
  }).join("");
  boxOffice.innerHTML=wilayas.map((name,i)=>{
    const code=shippingRateCode(i);
    const r=shippingRatesData[code]||{office:"",officeCompany:""};
    return `<div class="shipping-rate-row cols-office" data-name="${escapeAttr(name)}" data-code="${code}">
      <div class="src-cell src-num">${code}</div>
      <div class="src-cell src-name">${escapeAttr(name)}</div>
      <div class="src-cell"><input type="number" min="0" step="50" data-field="office" data-code="${code}" value="${escapeAttr(r.office)}" placeholder="دج"></div>
      <div class="src-cell src-company"><select data-field="officeCompany" data-code="${code}">
        <option value="">غير متوفر</option>
        ${Object.entries(officeCompanyLabels).map(([v,l])=>`<option value="${v}" ${r.officeCompany===v?"selected":""}>${l}</option>`).join("")}
      </select></div>
    </div>`;
  }).join("");
  applyShippingCollapse("home");
  applyShippingCollapse("office");
}
window.filterShippingRatesTable=function(){
  const q=(document.getElementById("shippingRatesSearch")?.value||"").trim().toLowerCase();
  document.querySelectorAll(".shipping-rate-row").forEach(el=>{
    const match=!q||el.dataset.name.toLowerCase().includes(q)||el.dataset.code.includes(q);
    el.classList.toggle("row-search-hidden",!match);
  });
  if(q){
    document.querySelectorAll(".shipping-rate-row").forEach(el=>el.classList.remove("row-more-hidden"));
    document.getElementById("shippingMoreHome").style.display="none";
    document.getElementById("shippingMoreOffice").style.display="none";
  }else{
    applyShippingCollapse("home");
    applyShippingCollapse("office");
  }
};
window.applyBulkShippingCompany=function(type){
  if(type==="home"){
    const wrap=document.getElementById("bulkHomeCompanySelect");
    const val=wrap?.dataset.value||"";
    document.querySelectorAll('#shippingRatesBodyHome .multi-select[data-field="homeCompany"]').forEach(el=>{
      const codes=new Set(val.split(",").map(v=>v.trim()).filter(Boolean));
      el.dataset.value=val;
      el.classList.toggle("empty",!codes.size);
      el.querySelector(".multi-select-btn").textContent=homeCompanyDisplay(val);
      el.querySelectorAll('input[type="checkbox"]').forEach(cb=>{cb.checked=codes.has(cb.value);});
    });
    return;
  }
  const val=document.getElementById("bulkOfficeCompanySelect")?.value||"";
  document.querySelectorAll('#shippingRatesBodyOffice select[data-field="officeCompany"]').forEach(sel=>{sel.value=val;});
};
window.saveShippingRates=async function(){
  const status=document.getElementById("shippingRatesStatus");
  const btn=document.querySelector('button[onclick="saveShippingRates()"]');
  const setStatus=(txt,cls)=>{if(status){status.textContent=txt;status.className="status "+cls;}};
  try{
    if(!window.bazarDb||!window.bazarSetDoc||!window.bazarDoc) throw new Error("Firebase غير جاهز، أعد تحميل الصفحة وحاول من جديد");
    if(window.bazarAuth && !window.bazarAuth.currentUser){
      setStatus("⚠️ جلسة الدخول انتهت. سجّل الدخول من جديد ثم أعد الحفظ.","err");
      return;
    }
    if(btn){btn.disabled=true;btn.dataset.origText=btn.textContent;btn.textContent="⏳ جاري الحفظ...";}
    const rates={};
    const prices={};
    // قسم باب الدار: السعر + الشركة (DHD/NOEST/48HR) + المدة — لكل ولاية من الـ58
    document.querySelectorAll('#shippingRatesBodyHome .shipping-rate-row').forEach(row=>{
      const code=row.dataset.code;
      const home=row.querySelector('[data-field="home"]').value;
      const homeCompany=row.querySelector('.multi-select[data-field="homeCompany"]')?.dataset.value||"";
      const duration=row.querySelector('[data-field="duration"]').value;
      rates[code]={
        ...(rates[code]||{}),
        home:home===""?"":Number(home),
        homeCompany,
        duration:duration.trim()
      };
      prices[code]=home===""?"":Number(home);
    });
    // قسم المكتب: السعر + الشركة (DHD EXPRESS) فقط — منفصل تمامًا عن باب الدار
    document.querySelectorAll('#shippingRatesBodyOffice .shipping-rate-row').forEach(row=>{
      const code=row.dataset.code;
      const office=row.querySelector('[data-field="office"]').value;
      const officeCompany=row.querySelector('[data-field="officeCompany"]').value;
      rates[code]={
        ...(rates[code]||{}),
        office:office===""?"":Number(office),
        officeCompany
      };
    });
    const payload={rates,prices,updatedAt:window.bazarServerTimestamp()};
    await window.bazarSetDoc(window.bazarDoc(window.bazarDb,"settings","shipping"),payload,{merge:true});
    // تحقّق فعلي: نعيد قراءة الوثيقة من القاعدة للتأكد أن التغييرات وصلت فعلاً وليست محجوبة بصمت.
    // ⚠️ لا نقارن عبر JSON.stringify مباشرة: Firestore لا يضمن ترتيب حقول الخريطة (map)
    // بنفس ترتيب إنشائها محليًا، خصوصًا بعد كتابة merge:true على وثيقة موجودة مسبقًا
    // بحقول أُنشئت بترتيب مختلف — فتُصبح المقارنة النصية مختلفة رغم تطابق القيم فعليًا،
    // مما كان يُظهر "فشل التحقق" حتى عندما ينجح الحفظ فعلاً. نقارن الحقول قيمة بقيمة بدل ذلك.
    function sameRate(a,b){
      a=a||{};b=b||{};
      const keys=new Set([...Object.keys(a),...Object.keys(b)]);
      for(const k of keys){ if(String(a[k]??"")!==String(b[k]??"")) return false; }
      return true;
    }
    let verified=false;
    try{
      const snap=await window.bazarGetDoc(window.bazarDoc(window.bazarDb,"settings","shipping"));
      const saved=snap.exists()?(snap.data().rates||{}):{};
      const sampleCode=Object.keys(rates)[0];
      verified = sampleCode ? sameRate(saved[sampleCode],rates[sampleCode]) : true;
    }catch(verifyErr){console.error("verify failed",verifyErr);}
    shippingRatesData=rates;
    if(verified){
      setStatus("✅ تم حفظ أسعار التوصيل والتحقق من وصولها للقاعدة — ستظهر فورًا في المتجر.","ok");
    }else{
      setStatus("⚠️ تم إرسال الحفظ لكن التحقق فشل — تأكد أن قواعد Firestore (Rules) تسمح بالقراءة والكتابة لمجموعة settings، ثم أعد الحفظ.","err");
    }
  }catch(e){
    console.error(e);
    let msg=e.message||"خطأ غير معروف";
    if(e.code==="permission-denied"||/insufficient permissions/i.test(msg)){
      msg="تم رفض الحفظ من Firestore (Permission denied). هذا يعني أن قواعد الأمان (Firestore Rules) في مشروعك على Firebase لا تسمح بالكتابة حاليًا. افتح Firebase Console → Firestore Database → Rules، وتأكد من نشر القاعدة الخاصة بـ settings (allow write: if request.auth != null) ثم اضغط Publish وحاول من جديد.";
    }
    setStatus("❌ تعذر حفظ الأسعار: "+msg,"err");
  }finally{
    if(btn){btn.disabled=false;btn.textContent=btn.dataset.origText||"💾 حفظ الأسعار";}
  }
};

// ================= مركز الإضافات (Addons) =================
const addonsDefs=[
 {key:"googleAnalytics",icon:"📊",iconClass:"ga",name:"Google Analytics",desc:"تحليلات متقدمة لفهم زوار متجرك وسلوكهم.",label:"Measurement ID",ph:"G-XXXXXXXXXX",pattern:/^G(-)?[A-Z0-9]{6,}$/},
 {key:"tiktokPixel",icon:"♪",iconClass:"tiktok",name:"TikTok Pixel",desc:"تتبع وتحليل أداء الإعلانات عبر TikTok Pixel.",label:"Pixel ID",ph:"e.g. 123456789012345",pattern:/^[0-9]{10,25}$/},
 {key:"metaPixel",icon:"∞",iconClass:"meta",name:"Meta Pixel",desc:"ربط وتتبع أحداث متجرك عبر Meta Pixel.",label:"Pixel ID",ph:"e.g. 1234567890",pattern:/^[0-9]{8,20}$/},
 {key:"googleTagManager",icon:"◆",iconClass:"gtm",name:"Google Tag Manager",desc:"إدارة العلامات والتتبع بسهولة عبر Google Tag Manager.",label:"Container ID",ph:"GTM-XXXXXXX",pattern:/^GTM-[A-Z0-9]{4,}$/},
 {key:"searchConsole",icon:"▣",iconClass:"search",name:"Google Search Console",desc:"راقب أداء متجرك في نتائج البحث وتحسين ظهوره.",label:"Verification Code",ph:"google-site-verification",pattern:/^\S+$/}
];
const ADDON_FIELD_LABELS={"customerName":"الاسم","customerPhone":"الهاتف","wilaya":"الولاية","address":"العنوان","product":"المنتج","quantity":"الكمية","price":"السعر","shipping":"التوصيل","total":"الإجمالي","status":"الحالة","createdAt":"التاريخ","order":"رقم الطلب"};
let localAddons={},activeAddonKey=null;
function escSoft(v){return String(v||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function addonDefaults(){
  var d={};
  addonsDefs.forEach(function(x){d[x.key]={id:"",enabled:false};});
  return d;
}
function dbReady(){return !!(window.bazarDb&&window.bazarDoc&&window.bazarGetDoc&&window.bazarSetDoc);}
function showAddons(el){showView("addons",el||null,false);renderAddonsGrid();if(window.bazarSyncAddons)window.bazarSyncAddons();}
function addonStateOf(c){
  if(!c)c={};
  var enabled=c.enabled===true;
  var hasId=String(c.id||c.endpoint||"").trim();
  if(!enabled)return{key:"off",txt:"غير متصل"};
  if(!hasId)return{key:"setup",txt:"يحتاج إلى إعداد"};
  return{key:"on",txt:"مفعّل"};
}
function renderAddonsGrid(){
  var grid=document.getElementById("addonsGrid");
  if(!grid)return;
  grid.innerHTML=addonsDefs.map(function(d){
    var c=localAddons[d.key]||{};
    var st=addonStateOf(c);
    var enabled=c.enabled===true;
    var shownId=String(c.id||c.endpoint||"").trim();
    var idLine=shownId?('<div class="addon-idline" dir="ltr">'+escSoft(shownId)+'</div>'):"";
    var toggleBtn=enabled
      ? '<button class="btn addon-disable" onclick="toggleAddon(\''+d.key+'\')">تعطيل</button>'
      : '<button class="btn addon-enable" onclick="toggleAddon(\''+d.key+'\')">تفعيل</button>';
    return '<div class="addon-card">'+
      '<div class="addon-top"><span class="addon-icon '+d.iconClass+'">'+d.icon+'</span><h3>'+d.name+'</h3></div>'+
      '<span class="addon-badge st-'+st.key+'">'+st.txt+'</span>'+
      '<p class="addon-desc">'+d.desc+'</p>'+
      idLine+
      '<div class="addon-actions">'+
        '<button class="btn addon-setup" onclick="openAddon(\''+d.key+'\')">⚙ إعداد</button>'+
        '<button class="btn addon-test" onclick="testAddon(\''+d.key+'\')">🔍 اختبار</button>'+
        toggleBtn+
      '</div>'+
    '</div>';
  }).join("");
}
function setAddonStatus(msg,ok){
  var st=document.getElementById("addonStatus");
  if(!st)return;
  st.className="status "+(ok?"ok":"err");
  st.classList.remove("hidden");
  st.textContent=String(msg||"");
  setTimeout(function(){st.classList.add("hidden");},6000);
}
function readLocalCache(){
  try{return JSON.parse(localStorage.getItem("bazarAddons")||"{}");}catch(e){return{};}
}
function writeLocalCache(v){
  try{localStorage.setItem("bazarAddons",JSON.stringify(v||{}));}catch(e){}
}
// Firestore = المصدر الحقيقي للبيانات. localStorage = خزينة مؤقتة (Cache) فقط.
async function syncAddons(){
  if(!dbReady()) return false;
  try{
    var ref=window.bazarDoc(window.bazarDb,"settings","addons");
    var existing={};
    try{var snap=await window.bazarGetDoc(ref);if(snap&&snap.exists())existing=snap.data()||{};}catch(e){console.warn("addons read",e);}
    var merged=Object.assign(addonDefaults(),existing);
    if(!Object.keys(existing).length){
      // إنشاء برمجي تلقائي للمستند إن لم يكن موجودًا (بدون حذف أي بيانات)
      try{await window.bazarSetDoc(ref,merged,{merge:true});}catch(e){console.warn("addons ensure doc",e);}
    }
    localAddons=merged;
    writeLocalCache(localAddons);
    renderAddonsGrid();
    return true;
  }catch(e){console.warn(e);return false;}
}
window.bazarSyncAddons=syncAddons;
// تحديث مباشر من Firestore حتى عبر الأجهزة والجلسات الأخرى
window.bazarOnRemoteAddon=function(data){
  if(!data||typeof data!=="object")return;
  var merged=Object.assign(addonDefaults(),data);
  if(activeAddonKey)merged[activeAddonKey]=localAddons[activeAddonKey]||merged[activeAddonKey];
  localAddons=merged;
  writeLocalCache(localAddons);
  renderAddons();
};
async function saveAddons(msg){
  writeLocalCache(localAddons);
  renderAddons();
  if(!dbReady()){
    setAddonStatus("Firestore لم يكتمل اتصاله بعد — أعد المحاولة خلال لحظة.",false);
    return false;
  }
  try{
    var ref=window.bazarDoc(window.bazarDb,"settings","addons");
    await window.bazarSetDoc(ref,Object.assign(addonDefaults(),localAddons),{merge:true});
    if(msg)setAddonStatus(msg+" ✅",true);
    renderAddons();
    return true;
  }catch(e){
    console.error("addons save",e);
    setAddonStatus("تعذر الحفظ في Firestore: "+(e.message||"خطأ غير معروف"),false);
    return false;
  }
}
window.bazarSaveAddons=saveAddons;
function renderAddons(){renderAddonsGrid();}
async function toggleAddon(key){
  var on=!(localAddons[key]&&localAddons[key].enabled===true);
  localAddons[key]=Object.assign({},localAddons[key]||addonDefaults()[key],{enabled:on});
  renderAddonsGrid();
  await saveAddons("تم "+(on?"تفعيل":"تعطيل")+" الإضافة");
}
function idValueOf(c,d){
  return (d&&d.field==="endpoint"?(c&&c.endpoint)||"":(c&&c.id)||"").trim();
}
function validatePattern(d,raw){
  if(!raw)return{ok:false,msg:"لم يُدخل معرّف بعد. أضف الـ ID وفعّل الإضافة."};
  if(d.pattern&&!d.pattern.test(raw))return{ok:false,msg:"صيغة المعرّف غير صحيحة. الصيغة الصحيحة مثال: "+d.ph};
  return{ok:true,msg:""};
}
function openAddon(key){
  activeAddonKey=key;
  var d=addonsDefs.find(function(x){return x.key===key;});
  var modal=document.getElementById("settingsModal");
  modal.classList.remove("hidden");
  document.getElementById("settingModalIcon").textContent=d?d.icon:"🧩";
  document.getElementById("settingModalTitle").textContent=d?d.name:"الإضافة";
  var descEl=document.getElementById("settingModalDesc");
  descEl.textContent=d?d.desc:"";
  var c=localAddons[key]||{};
  var current=d?idValueOf(c,d):"";
  var hint= (d&&d.key==="searchConsole")
    ? "ملاحظة صريحة: حقن <code>&lt;meta&gt;</code> عبر JavaScript لا يكفي — زاحف Google يقرأ ملف HTML المصدر ولا ينفّذ السكربتات عند التحقق من الملكية.\nالطريقة الموثوقة مع GitHub Pages هي ملف تحقق ثابت <code>googleXXXX.html</code> في جذر المستودع، أو سجل DNS TXT. استخدم زر «⬇ توليد ملف التحقق» بالأسفل وأنشره على GitHub مرة واحدة، وسيبقى التحقق ساريًا."
    : "عند التفعيل يُحمَّل كود الخدمة في صفحات المتجر مرة واحدة فقط.";
  var checked=(c.enabled===true)?"checked":"";
  var gscHelp = (d&&d.key==="searchConsole")
    ? '<div class="gsc-help" style="margin-top:12px;border:1px solid #e4e7ec;border-radius:10px;padding:12px;background:#fafbfc">'+
        '<b style="font-size:13px">💡 تحقق صحيح مع GitHub Pages</b>'+
        '<ol style="margin:8px 0 10px;padding-right:20px;font-size:12px;line-height:1.9;color:#555">'+
          '<li>احفظ الرمز أعلاه وافعّل الإضافة أولًا.</li>'+
          '<li>اضغط «توليد ملف التحقق» لإنزالت <code>googleXXXX.html</code>.</li>'+
          '<li>ارفع هذا الملف إلى جذر المستودع (GitHub Pages) بجانب index.html.</li>'+
          '<li>في Search Console اختر طريقة «ملف HTML» والصقه بالرمز.</li></ol>'+
        '<button type="button" class="btn gray" style="padding:9px 12px;background:#eef2ff;color:#3b4fd8;width:auto" onclick="gscDownloadFile()">⬇ توليد ملف التحقق</button>'+
      '</div>'
    : "";
  document.getElementById("settingModalBody").innerHTML=
    '<div class="setting-form">'+
      '<label>'+d.label+'<input id="addon_id" type="text" value="'+escSoft(current)+'" placeholder="'+d.ph+'" dir="ltr"></label>'+
      '<small class="hint" style="white-space:pre-line">'+hint+'</small>'+
      gscHelp+
      '<div class="toggle-row"><div>مفعّلة</div><input id="addon_enabled" type="checkbox" '+checked+'></div>'+
    '</div>';
  var buttons='<button class="green" onclick="saveAddon()">💾 حفظ الإعدادات</button><button class="gray" onclick="closeAddon()">إلغاء</button>';
  document.querySelectorAll("#settingsModal .modal-actions").forEach(function(a){a.innerHTML=buttons;});
}
function closeAddon(){document.getElementById("settingsModal").classList.add("hidden");activeAddonKey=null;}
async function saveAddon(){
  if(!activeAddonKey){closeAddon();return;}
  var key=activeAddonKey;
  var d=addonsDefs.find(function(x){return x.key===key;});
  var c=localAddons[key]||{};
  var isEndpoint=(d&&d.field)==="endpoint";
  var inp=document.getElementById("addon_id");
  var raw=inp?String(inp.value||"").trim():"";
  var fieldName=isEndpoint?"endpoint":"id";
  if(isEndpoint){c.endpoint=raw;delete c.id;}else{c.id=raw;delete c.endpoint;}
  var dest=document.getElementById("addon_enabled");
  if(dest)c.enabled=dest.checked;
  localAddons[key]=c;
  var check=null;
  if(dest&&dest.checked&&raw)check=validatePattern(d,raw);
  if(check&&!check.ok){setAddonStatus(check.msg,false);return;}
  closeAddon();
  await saveAddons("تم حفظ إعداد الإضافة");
}
async function testAddon(key){
  var d=addonsDefs.find(function(x){return x.key===key;});
  var c=localAddons[key]||{};
  var raw=idValueOf(c,d);
  var lines=[];
  // 1) الحالة من حيث التفعيل
  if(c.enabled===true) lines.push("✓ إعداد مفعّل");
  else lines.push("⚪ غير مفعّلة — فعّلها من الزر أدناه");

  // 2) وجود المعرّف وصحة تنسيقه
  if(!raw) lines.push("🟡 بحاجة إلى إعداد: أضف الـ ID أولًا");
  else{
    var v=validatePattern(d,raw);
    if(v.ok) lines.push("✓ تنسيق المُعرّف صحيح ("+raw+")");
    else lines.push("✗ "+v.msg);
  }

  // 3) التحقق من الحفظ الفعلي في Firestore (subscripton المباشر)
  if(window.bazarSyncAddons){
    lines.push("⏳ جارٍ التحقق من Firestore…");
    setAddonStatus(lines.join(" · "),true);
    var okFirestore=false;
    try{
      var done=await window.bazarSyncAddons();
      okFirestore=!!done;
      var fresh=localAddons[key]||{};
      var freshRaw=idValueOf(fresh,d);
      if(okFirestore && freshRaw){
        lines=[];
        if(fresh.enabled===true) lines.push("✓ مفعّل");
        else lines.push("⚪ غير مفعّل");
        var vv=validatePattern(d,freshRaw);
        if(vv.ok) lines.push("✓ صيغة صحيحة ("+freshRaw+")") ; else lines.push("✗ "+vv.msg);
        lines.push("✓ محفوظ في Firestore (settings/addons)");
      }else{
        lines.push("✗ لم يُحفظ بعد في Firestore — احفظ الإعداد أولًا");
      }
    }catch(e){
      lines.push("؟ تعذر التحقق من Firestore: "+(e&&e.message||"خطأ"));
    }
  }else{
    var v2; var rawNow=idValueOf(c,d);
    if(rawNow){ v2=validatePattern(d,rawNow); if(v2.ok) lines.push("✓ محفوظ محليًا"); else lines.push("✗ "+v2.msg); }
    lines.push("؟ Firestore غير متصل — التأكيد النهائي غير متاح");
  }

  // ملاحظة دقيقة لخدمة Search Console
  if(d&&d.key==="searchConsole"){
    lines.push("⚠ تحقق GSC يتطلب أيضًا: ملف googleXXXX.html ثابت في جذر GitHub Pages أو سجل DNS، أو الميتا في مصدر HTML الفعلي. حقن JavaScript وحده لا يؤكد الملكية لمعظم طرق التحقق.");
  }

  setAddonStatus(lines.join(" — "),true);
}
function gscDownloadFile(){
  const inp=document.getElementById("addon_id");
  const code=(inp&&String(inp.value||"").trim())||"";
  if(!code){setAddonStatus("أدخل رمز التحقق أولًا لإنشاء الملف. 🟡",true);return;}
  const fileName="google"+code.replace(/[^A-Za-z0-9_-]/g,"")+".html";
  const content='<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin"><title>Google verification</title></head><body><p>google-site-verification: '+code+'</p></body></html>';
  const blob=new Blob([content],{type:"text/html;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},200);
  setAddonStatus("تم إنزال "+fileName+" — ارفعه إلى جذر المستودع بجانب index.html. 📄",true);
}
// تحميل البطاقات الخمس فورًا من الخزينة المؤقتة (بدون انتظار Firestore).
// ثم يُشغَّل الحدث عند التأكد من تسجيل الدخول لقراءة المصدر الحقيقي.
localAddons=Object.assign(addonDefaults(),readLocalCache());
renderAddonsGrid();
