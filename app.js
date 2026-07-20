const $ = id => document.getElementById(id);
const today = new Date();
$('voucherDate').value = today.toISOString().slice(0,10);$('expenseDate').value = today.toISOString().slice(0,10);

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
    $(id).addEventListener('input', () => localStorage.setItem('voucher-'+id,$(id).value)); 
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
        $('total').textContent = money(total);$('itemCount').textContent = `${expensesList.length} expense${expensesList.length === 1 ? '' : 's'}`; 
        
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
        ['description','client','amount'].forEach(id => $(id).value = '');$('receipt').value = '';
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
function text(page,value,x,y,size=10,bold=false,color=PDFLib.rgb(.08,.13,.
