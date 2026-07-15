const $ = id => document.getElementById(id);
const today = new Date();
$('voucherDate').value = today.toISOString().slice(0,10);
$('expenseDate').value = today.toISOString().slice(0,10);

// 1. ASYNC DATABASE INITIALIZATION
let db;
const dbRequest = indexedDB.open("VoucherEngineDB", 3);

dbRequest.onupgradeneeded = e => {
    db = e.target.result;
    if (db.objectStoreNames.contains("expenses")) {
        db.deleteObjectStore("expenses");
    }
    db.createObjectStore("expenses", { keyPath: "createdAt" });
};

dbRequest.onsuccess = e => {
    db = e.target.result;
    loadExpensesFromDevice(); 
};

dbRequest.onerror = e => {
    console.error("Database Error:", e.target.error);
    alert("Storage Error: " + e.target.error.message);
};

// Auto-save form inputs
['firm','payee','narration'].forEach(id => { 
    const v = localStorage.getItem('voucher-'+id); 
    if(v) $(id).value = v; 
    $(id).addEventListener('input', () => localStorage.setItem('voucher-'+id, $(id).value)); 
});

// Dynamic Allocation Row Builder
$('addAllocationRow').onclick = () => {
    const tbody = $('allocationRows');
    const newRow = document.createElement('tr');
    newRow.innerHTML = `
        <td><input type="text" class="alloc-person" placeholder="e.g. Professional Name"></td>
        <td><input type="text" class="alloc-client" placeholder="e.g. Client Accounts"></td>
        <td><button type="button" class="remove" onclick="this.closest('tr').remove()">Remove</button></td>
    `;
    tbody.appendChild(newRow);
};

function money(n){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n)}
function esc(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function savedExpenseDate(expense){return expense.expenseDate?new Date(expense.expenseDate+'T12:00:00'):new Date(expense.createdAt)}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ dataString: reader.result, type: file.type });
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// 2. FETCH FROM DEVICE STORAGE AND RENDER TO LIST
function loadExpensesFromDevice() {
    if (!db) return;
    const transaction = db.transaction(["expenses"], "readonly");
    const store = transaction.objectStore("expenses");
    const request = store.getAll();

    request.onsuccess = () => {
        const expensesList = request.result || [];
        const body = $('expenseRows'); 
        const total = expensesList.reduce((n,x) => n + x.amount, 0); 
        $('total').textContent = money(total);
        $('itemCount').textContent = `${expensesList.length} expense${expensesList.length === 1 ? '' : 's'}`; 
        
        body.innerHTML = expensesList.length ? expensesList.map((x) => `
            <tr>
                <td>${savedExpenseDate(x).toLocaleDateString('en-IN',{dateStyle:'medium'})}</td>
                <td>${esc(x.description)}</td>
                <td>${esc(x.client)}</td>
                <td>${esc(x.accountHead)}</td>
                <td class="amount">${money(x.amount)}</td>
                <td>${x.fileDataStr ? '<span class="receipt">Attached</span>' : '-'}</td>
                <td><button type="button" class="remove" onclick="deleteExpense('${x.createdAt}')">Remove</button></td>
            </tr>
        `).join('') : '<tr class="empty"><td colspan="7">No expenses saved yet.</td></tr>'; 
    };
}

function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2600)}

// 3. PERSIST TEXT AND CONVERTED RECEIPT SAFELY
$('addExpense').onclick = async () => {
    if (!db) return alert("Database storage engine is initializing. Please try again in a brief second.");

    const expenseDate = $('expenseDate').value;
    const description = $('description').value.trim();
    const client = $('client').value.trim();
    const amount = Number($('amount').value);
    const file = $('receipt').files[0]; 

    if (!expenseDate || !description || !client || !amount || amount <= 0) {
        return toast('Please enter expense date, description, client name and amount.');
    }

    let fileDataStr = null;
    let fileType = null;

    if (file) {
        try {
            const encodedFile = await readFileAsBase64(file);
            fileDataStr = encodedFile.dataString;
            fileType = encodedFile.type;
        } catch (err) {
            return alert("Failed to read the file attachment on this device.");
        }
    }

    const createdAt = new Date().toISOString();
    const newExpense = {
        createdAt,
        expenseDate,
        description,
        client,
        amount,
        accountHead: $('accountHead').value,
        fileName: file ? file.name : '',
        fileDataStr,
        fileType
    };

    const transaction = db.transaction(["expenses"], "readwrite");
    const store = transaction.objectStore("expenses");
    const addRequest = store.add(newExpense);

    addRequest.onsuccess = () => {
        ['description','client','amount'].forEach(id => $(id).value = '');
        $('receipt').value = '';
        loadExpensesFromDevice();
        toast('Expense and receipt saved locally!');
    };

    addRequest.onerror = e => alert("Failed to save data entry: " + e.target.error.message);
};

window.deleteExpense = (id) => {
    if (!db) return;
    const transaction = db.transaction(["expenses"], "readwrite");
    const store = transaction.objectStore("expenses");
    store.delete(id);
    transaction.oncomplete = () => {
        loadExpensesFromDevice();
        toast('Expense removed.');
    };
};

$('clearAll').onclick = () => {
    if (!db) return;
    if (confirm('Clear all saved expenses from this device?')) {
        const transaction = db.transaction(["expenses"], "readwrite");
        const store = transaction.objectStore("expenses");
        store.clear();
        transaction.oncomplete = () => {
            loadExpensesFromDevice();
            toast('Device database cleared.');
        };
    }
};

function words(n){const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'],b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];const f=x=>x<20?a[x]:x<100?b[Math.floor(x/10)]+(x%10?' '+a[x%10]:''):x<1000?a[Math.floor(x/100)]+' Hundred'+(x%100?' '+f(x%100):''):x<100000?f(Math.floor(x/1000))+' Thousand'+(x%1000?' '+f(x%1000):''):f(Math.floor(x/100000))+' Lakh'+(x%100000?' '+f(x%100000):'');return f(Math.round(n))+' rupees only';}
function text(page,value,x,y,size=10,bold=false,color=PDFLib.rgb(.08,.13,.23)){page.drawText(String(value||''),{x,y,size,font:bold?window.fontBold:window.font, color});}
function centeredText(page,value,x,y,width,size=10,bold=false,color=PDFLib.rgb(.08,.13,.23)){const font=bold?window.fontBold:window.font;const label=String(value||'');page.drawText(label,{x:x+(width-font.widthOfTextAtSize(label,size))/2,y,size,font,color});}
function rightText(page,value,right,y,size=10,bold=false,color=PDFLib.rgb(.08,.13,.23)){const font=bold?window.fontBold:window.font;const label=String(value||'');page.drawText(label,{x:right-font.widthOfTextAtSize(label,size),y,size,font,color});}
function line(page,x1,y1,x2,y2,w=1){page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},thickness:w,color:PDFLib.rgb(.55,.59,.65)});}

async function voucherPage(pdf, expensesList){
    const page=pdf.addPage([612,792]),{height:h}=page.getSize();
    window.font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    window.fontBold=await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const dark=PDFLib.rgb(.02,.30,.28),teal=PDFLib.rgb(.03,.50,.48),pale=PDFLib.rgb(.91,.98,.97),white=PDFLib.rgb(1,1,1),date=new Date($('voucherDate').value+'T12:00:00');
    
    page.drawRectangle({x:0,y:h-72,width:612,height:72,color:dark});
    text(page,$('firm').value,38,h-32,14,true,white);
    text(page,'CASH / BANK VOUCHER',38,h-55,18,true,white);
    text(page,'Voucher No.:',390,h-32,9,false,PDFLib.rgb(.85,.97,.95));
    text(page,'Date: '+date.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}),390,h-49,9,false,PDFLib.rgb(.85,.97,.95));
    
    const total=expensesList.reduce((n,x)=>n+x.amount,0);
    let y=680;
    
    [['Pay To',$('payee').value],['Paid by',$('paymentMode').value],['Narration',$('narration').value]].forEach(([l,v])=>{
        text(page,l+':',38,y,10,true);
        text(page,v,125,y,10);
        line(page,38,y-8,574,y-8,.5);
        y-=31
    });
    
    const accounts=['Filing Fees','General Office Expenses','Payment on Behalf of Client','Petrol & Conveyance','Photocopying Charges','Postage & Courier','Staff Welfare','Travelling Expenses'],sums=Object.fromEntries(accounts.map(a=>[a,0])),aCols=[38,244,306,512,574],accountTop=y;
    expensesList.forEach(e=>sums[e.accountHead]=(sums[e.accountHead]||0)+e.amount);
    
    page.drawRectangle({x:38,y:y-22,width:536,height:22,color:teal});
    [['Account Head',0],['Rupees',1],['Account Head',2],['Rupees',3]].forEach(([v,i])=>centeredText(page,v,aCols[i],y-15,aCols[i+1]-aCols[i],8,true,white));
    y-=22;
    
    for(let i=0;i<4;i++){
        const left=accounts[i],right=accounts[i+4];
        text(page,left,42,y-14,8);
        rightText(page,sums[left]?sums[left].toFixed(2):'',aCols[2]-5,y-14,8);
        text(page,right,aCols[2]+4,y-14,8);
        rightText(page,sums[right]?sums[right].toFixed(2):'',aCols[4]-5,y-14,8);
        line(page,38,y-22,574,y-22,.4);
        y-=22;
    }
    
    page.drawRectangle({x:38,y:y-22,width:536,height:22,color:pale});
    centeredText(page,'TOTAL',aCols[2],y-15,aCols[3]-aCols[2],8,true);
    rightText(page,total.toFixed(2),aCols[4]-5,y-15,8,true);
    aCols.forEach(x=>line(page,x,accountTop,x,y-22,.4));
    
    y-=34;
    text(page,'Rupees in words: '+words(total),38,y,9,true);
    
    y-=25;
    line(page,38,y,574,y,.7);
    text(page,$('payee').value,38,y-16,8);
    text(page,'Prepared by',38,y-29,8,true);
    centeredText(page,'Authorized by',220,y-29,128,8,true);
    centeredText(page,"Receiver's Signature",430,y-29,144,8,true);
    
    y-=50;
    const dCols=[38,100,355,500,574],detailTop=y,heads=['Date','Particulars','Client Name','Amount (Rs.)'];
    page.drawRectangle({x:38,y:y-22,width:536,height:22,color:teal});
    heads.forEach((v,i)=>centeredText(page,v,dCols[i],y-15,dCols[i+1]-dCols[i],8,true,white));
    y-=22;
    
    expensesList.forEach(e=>{
        if(y<70)return;
        text(page,savedExpenseDate(e).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}),dCols[0]+4,y-14,8);
        text(page,e.description.slice(0,40),dCols[1]+4,y-14,8);
        text(page,e.client.slice(0,21),dCols[2]+4,y-14,8);
        rightText(page,e.amount.toFixed(2),dCols[4]-5,y-14,8,true);
        line(page,38,y-22,574,y-22,.4);
        y-=22;
    });
    
    page.drawRectangle({x:38,y:y-22,width:536,height:22,color:pale});
    centeredText(page,'TOTAL', dCols[2],y-15,dCols[3]-dCols[2],8,true);
    rightText(page,total.toFixed(2),dCols[4]-5,y-15,8,true);
    dCols.forEach(x=>line(page,x,detailTop,x,y-22,.4));

    // --- NEW PLACEMENT: PERSONNEL CLIENT ALLOCATION TABLE DRAWS DYNAMICALLY HERE AFTER PARTICULARS ---
    y-=25;
    const allocRows = document.querySelectorAll('#allocationRows tr');
    let hasData = false;
    
    // Scan if columns have any values filled out before processing structural lines
    allocRows.forEach(row => {
        if(row.querySelector('.alloc-person').value.trim() || row.querySelector('.alloc-client').value.trim()) {
            hasData = true;
        }
    });

    if (hasData && y > 90) {
        page.drawRectangle({ x: 38, y: y - 18, width: 536, height: 18, color: teal });
        centeredText(page, 'Personnel Name', 38, y - 12, 200, 8, true, white);
        centeredText(page, 'Assigned Client Accounts', 238, y - 12, 336, 8, true, white);
        y -= 18;
        
        const tableStart = y;
        allocRows.forEach(row => {
            const person = row.querySelector('.alloc-person').value.trim();
            const clientVal = row.querySelector('.alloc-client').value.trim();
            
            if (person || clientVal) {
                text(page, person, 45, y - 14, 8);
                text(page, clientVal, 245, y - 14, 8);
                line(page, 38, y - 20, 574, y - 20, .4);
                y -= 20;
            }
        });
        
        line(page, 38, tableStart, 38, y, .4);
        line(page, 238, tableStart, 238, y, .4);
        line(page, 574, tableStart, 574, y, .4);
    }
    
    return page;
}

async function appendReceipt(pdf, fileDataStr, fileType, fileName) {
    const base64Content = fileDataStr.split(',')[1];
    const binaryStr = atob(base64Content);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }

    if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
        try {
            const src = await PDFLib.PDFDocument.load(bytes.buffer);
            const pages = await pdf.copyPages(src, src.getPageIndices());
            pages.forEach(p => pdf.addPage(p));
            return;
        } catch {
            throw new Error(`${fileName} could not be read as a PDF.`);
        }
    }
    let image;
    try {
        image = fileType.includes('png') ? await pdf.embedPng(bytes.buffer) : await pdf.embedJpg(bytes.buffer);
    } catch {
        throw new Error(`${fileName} is not a supported image.`);
    }
    const page = pdf.addPage(PDFLib.PageSizes.A4), {width, height} = page.getSize(), scale = Math.min((width-48)/image.width, (height-48)/image.height, 1);
    page.drawText('Supporting receipt - ' + fileName, {x:24, y:height-22, size:8, font:window.font});
    page.drawImage(image, {x:(width-image.width*scale)/2, y:(height-image.height*scale)/2-4, width:image.width*scale, height:image.height*scale});
}

// 6. COMPILE LEDGER
$('generate').onclick = async () => {
    if (!db) return toast("Database engine not ready.");
    const transaction = db.transaction(["expenses"], "readonly");
    const store = transaction.objectStore("expenses");
    const request = store.getAll();

    request.onsuccess = async () => {
        const expensesList = request.result || [];
        if (!expensesList.length) return toast('Add at least one expense first.');
        if (!$('payee').value.trim()) return toast('Please enter the payee name.');
        
        const btn = $('generate');
        btn.disabled = true;
        btn.textContent = 'Preparing PDF...';
        
        try {
            const pdf = await PDFLib.PDFDocument.create();
            await voucherPage(pdf, expensesList);
            
            for (const e of expensesList) {
                if (e.fileDataStr) {
                    await appendReceipt(pdf, e.fileDataStr, e.fileType, e.fileName);
                }
            }
            
            const out = await pdf.save();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([out], {type:'application/pdf'}));
            a.download = `Cash Voucher - ${$('voucherDate').value}.pdf`;
            a.click();
            URL.revokeObjectURL(a.href);
            toast('Your final voucher PDF is ready.');
        } catch (err) {
            console.error(err);
            toast(err.message || 'Could not create the PDF.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Generate final voucher PDF';
        }
    };
};
