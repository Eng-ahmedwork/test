// Web Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDmMZPPD16KgYD2JlgLfB3u1-hplVLcScg",
    authDomain: "realsystem-12c37.firebaseapp.com",
    databaseURL: "https://realsystem-12c37-default-rtdb.firebaseio.com",
    projectId: "realsystem-12c37",
    storageBucket: "realsystem-12c37.firebasestorage.app",
    messagingSenderId: "785083627306",
    appId: "1:785083627306:web:0466af9f6a83f82cff5053",
    measurementId: "G-3DEK0Y1KPY"
};

// Initialize Firebase (Compat SDK)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// State Variables
let activeTab = "students";
let allStudents = [];
let allTeachers = [];
function getTodayMonthString() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

let selectedMonth = getTodayMonthString(); // Default selected month (Current YYYY-MM)
let selectedStudent = null; // Currently selected student profile
let activeAttendanceStudentId = null; // Currently searched/selected student for showing attendance subrow
let lastProcessedScanTime = 0; // Avoid processing old scans on page load
let currentFilteredStudents = []; // Stores currently filtered table students list
let currentBulkTargetStudents = []; // Stores current target students for WhatsApp modal
let selectedWaBulkTemplateKey = null; // Stores selected template key for WhatsApp modal

// Convert any Eastern Arabic digits (٠-٩) to English digits (0-9)
function toEnglishDigits(str) {
    if (str === null || str === undefined) return "0";
    return String(str).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

// XSS Sanitization / HTML Escaping Helper
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// SHA-256 Password Hashing Helper
async function hashPassword(password) {
    if (!password) return '';
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getSelectedMonthText() {
    const el = document.getElementById("filter-month-select");
    if (el && el.options && el.selectedIndex >= 0) {
        return el.options[el.selectedIndex].text;
    }
    return `شهر ${new Date().getMonth() + 1}`;
}

function getSelectedSessionText() {
    const el = document.getElementById("active-session-select");
    if (el && el.options && el.selectedIndex >= 0) {
        return el.options[el.selectedIndex].text;
    }
    return "الحصة 1";
}

// Predefined WhatsApp Message Templates Generator
function getWaBulkTemplates() {
    const monthText = getSelectedMonthText();     // e.g., "شهر 8"
    const sessionText = getSelectedSessionText(); // e.g., "الحصة 1"

    return {
        attendance: `السلام عليكم ورحمة الله وبركاته،\n\nنحيطكم علماً بأنه قد تم بحمد الله حضور الطالب/ـة: {student_name} درس اللغة العربية اليوم (${sessionText}).\n\nتحت إشراف مستر هيثم فؤاد`,
        absent: `السلام عليكم ورحمة الله وبركاته،\n\nنحيطكم علماً لم يتم حضور الطالب/ـة: {student_name} درس اللغة العربية اليوم (${sessionText}).\n\nتحت إشراف مستر هيثم فؤاد`,
        paid: `السلام عليكم ورحمة الله وبركاته،\n\nتم بحمد الله سداد مصروفات درس اللغة العربية (${monthText}) للطالب/ـة: {student_name} بنجاح.\n\nتحت إشراف مستر هيثم فؤاد`,
        unpaid: `السلام عليكم ورحمة الله وبركاته،\n\nتنبيه: يرجى العلم أنه لم يتم سداد مصروفات درس اللغة العربية (${monthText}) حتى الآن للطالب/ـة: {student_name}.\n\nتحت إشراف مستر هيثم فؤاد`,
        report: `السلام عليكم ورحمة الله وبركاته،\n\n📊 تقرير أداء الطالب/ـة: {student_name}\nدرس اللغة العربية (${monthText})\n\nتحت إشراف مستر هيثم فؤاد`
    };
}

// DOM Elements - General
const tabStudents = document.getElementById("tab-students");
const tabTeachers = document.getElementById("tab-teachers"); // Acts as Dashboard tab

const sectionStudentForm = document.getElementById("student-form-section");
const sectionStudentList = document.getElementById("student-list-section");
const sectionStudentProfile = document.getElementById("student-profile-section");

// DOM Elements - Analytics Dashboard Section
const sectionAnalyticsDashboard = document.getElementById("dashboard-analytics-section");
const dashFilterGrade = document.getElementById("dash-filter-grade");
const dashFilterMonth = document.getElementById("dash-filter-month");

const kpiTotalStudents = document.getElementById("kpi-total-students");
const kpiGradeSubtext = document.getElementById("kpi-grade-subtext");
const kpiAttendedToday = document.getElementById("kpi-attended-today");
const kpiAttendedRate = document.getElementById("kpi-attended-rate");
const kpiPaidStudents = document.getElementById("kpi-paid-students");
const kpiPaidStudentsRate = document.getElementById("kpi-paid-students-rate");
const kpiPaidRate = document.getElementById("kpi-paid-rate");
const kpiPaidCountText = document.getElementById("kpi-paid-count-text");
const topStudentsListContainer = document.getElementById("top-students-list");

let attendanceChartInstance = null;
let feesChartInstance = null;
let gradesChartInstance = null;

// DOM Elements - Students Tab
const inputAcademicId = document.getElementById("academic-id");
const inputName = document.getElementById("student-name");
const inputGrade = document.getElementById("student-grade");
const inputPhone = document.getElementById("student-phone");
const guardianPhone = document.getElementById("guardian-phone");
const studentNotes = document.getElementById("student-notes");
const inputSearch = document.getElementById("search-input");
const filterGradeSelect = document.getElementById("filter-grade-select");
const filterFeeSelect = document.getElementById("filter-fee-select");
const filterAttendanceSelect = document.getElementById("filter-attendance-select");
const btnWhatsAppUnattendedBulk = document.getElementById("btn-whatsapp-unattended-bulk");
const unattendedCountBadge = document.getElementById("unattended-count-badge");
const btnOpenWaSettings = document.getElementById("btn-open-wa-settings");
const waModalOverlay = document.getElementById("wa-modal-overlay");
const btnCloseWaModal = document.getElementById("btn-close-wa-modal");
const btnSaveWaConfig = document.getElementById("btn-save-wa-config");
const btnTestWaConfig = document.getElementById("btn-test-wa-config");
const inputWaApiUrl = document.getElementById("wa-api-url");
const inputWaInstanceId = document.getElementById("wa-instance-id");
const inputWaToken = document.getElementById("wa-token");
const filterMonthSelect = document.getElementById("filter-month-select");
const activeSessionSelect = document.getElementById("active-session-select");

const btnSave = document.getElementById("btn-save");
const btnEdit = document.getElementById("btn-edit");
const btnDelete = document.getElementById("btn-delete");
const btnClear = document.getElementById("btn-clear");
const btnManualSearch = document.getElementById("btn-manual-search");

const studentsListBody = document.getElementById("students-list-body");
const studentCountText = document.getElementById("student-count");

// DOM Elements - Teachers Tab
const inputTeacherAcademicId = document.getElementById("teacher-academic-id");
const inputTeacherName = document.getElementById("teacher-name");
const inputTeacherSubject = document.getElementById("teacher-subject");
const inputTeacherPhone = document.getElementById("teacher-phone");
const inputTeacherNotes = document.getElementById("teacher-notes");
const inputTeacherSearch = document.getElementById("teacher-search-input");

const btnTeacherSave = document.getElementById("btn-teacher-save");
const btnTeacherEdit = document.getElementById("btn-teacher-edit");
const btnTeacherDelete = document.getElementById("btn-teacher-delete");
const btnTeacherClear = document.getElementById("btn-teacher-clear");
const btnTeacherManualSearch = document.getElementById("btn-teacher-manual-search");

const teachersListBody = document.getElementById("teachers-list-body");
const teacherCountText = document.getElementById("teacher-count");

// DOM Elements - Dashboard Stats
const statTotalStudents = document.getElementById("stat-total-students");
const statTodayAttendance = document.getElementById("stat-today-attendance");
const statTotalTeachers = document.getElementById("stat-total-teachers");

// DOM Elements - Student Profile Section
const profileStudentName = document.getElementById("profile-student-name");
const profileStudentId = document.getElementById("profile-student-id");
const profileStudentGrade = document.getElementById("profile-student-grade");
const profileStudentPhone = document.getElementById("profile-student-phone");
const profileMonthSelect = document.getElementById("profile-month-select");
const paymentPaidCheckbox = document.getElementById("payment-paid-checkbox");
const paymentStatusLabel = document.getElementById("payment-status-label");
const paymentAmountInput = document.getElementById("payment-amount");
const btnSavePayment = document.getElementById("btn-save-payment");
const btnQuickAttend = document.getElementById("btn-quick-attend");
const sessionsGridContainer = document.getElementById("sessions-grid-container");

// Initialize Setup
document.addEventListener("DOMContentLoaded", () => {
    // Set scanner listening baseline timestamp to prevent loading old values
    lastProcessedScanTime = Date.now();
    
    // Set Month Selector default to Current Month if option exists
    if (filterMonthSelect) {
        let found = false;
        for (let i = 0; i < filterMonthSelect.options.length; i++) {
            if (filterMonthSelect.options[i].value === selectedMonth) {
                filterMonthSelect.selectedIndex = i;
                found = true;
                break;
            }
        }
        if (!found) {
            const opt = document.createElement('option');
            opt.value = selectedMonth;
            opt.textContent = `شهر ${new Date().getMonth() + 1}`;
            filterMonthSelect.appendChild(opt);
            filterMonthSelect.value = selectedMonth;
        }
    }

    if (dashFilterMonth) {
        dashFilterMonth.value = selectedMonth;
        dashFilterMonth.addEventListener("change", updateAnalyticsDashboard);
    }
    if (dashFilterGrade) {
        dashFilterGrade.addEventListener("change", updateAnalyticsDashboard);
    }

    setupFirebaseListeners();
    setupEventHandlers();
    setupTabs();
    setupProfileEvents();
    setupSelectClearButtons();
    setupWhatsAppBulkModal();
});

// Setup Real-time Listeners
function setupFirebaseListeners() {
    // 1. Connection Status Monitor
    const connectedRef = db.ref(".info/connected");
    connectedRef.on("value", (snapshot) => {
        const dot = document.getElementById("status-dot");
        const text = document.getElementById("status-text");
        if (snapshot.val() === true) {
            dot.className = "status-dot online";
            text.textContent = "متصل بقاعدة البيانات";
        } else {
            dot.className = "status-dot offline";
            text.textContent = "غير متصل بقاعدة البيانات";
        }
    });

// Web Audio Beep Feedback Helper
function playWebScanBeep() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const audioCtx = new AudioCtx();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(2000, audioCtx.currentTime); // High pitch barcode scanner tone
        gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
        console.warn("Audio beep error:", e);
    }
}

    // 2. Listen to Scanned Code updates from Android App
    const scannedCodeRef = db.ref("scanned_code");
    scannedCodeRef.on("value", (snapshot) => {
        const data = snapshot.val();
        if (data && data.academicId && data.timestamp) {
            // Check if this scan is new (scanned after page loaded/last processed)
            if (data.timestamp > lastProcessedScanTime) {
                lastProcessedScanTime = data.timestamp;
                playWebScanBeep();
                
                if (activeTab === "students") {
                    inputAcademicId.value = data.academicId;
                    
                    // Visual Pulse animation
                    inputAcademicId.classList.remove("pulse-highlight");
                    void inputAcademicId.offsetWidth; // Trigger reflow to restart animation
                    inputAcademicId.classList.add("pulse-highlight");
                    
                    const currentSess = activeSessionSelect ? activeSessionSelect.value : "1";
                    checkAndLoadStudent(data.academicId);
                    quickAttendStudentSession(data.academicId, currentSess);
                } else {
                    inputTeacherAcademicId.value = data.academicId;
                    
                    // Visual Pulse animation
                    inputTeacherAcademicId.classList.remove("pulse-highlight");
                    void inputTeacherAcademicId.offsetWidth; // Trigger reflow to restart animation
                    inputTeacherAcademicId.classList.add("pulse-highlight");
                    
                    showToast("رمز QR جديد ممسوح", `الرقم الأكاديمي للمعلم: ${data.academicId}`, "info");
                    checkAndLoadTeacher(data.academicId);
                }
            }
        }
    });

    // 3. Listen to student directory records (Real-time List)
    const studentsRef = db.ref("students");
    studentsRef.on("value", (snapshot) => {
        const data = snapshot.val();
        allStudents = [];
        
        if (data) {
            for (const key in data) {
                if (data.hasOwnProperty(key)) {
                    allStudents.push({
                        academicId: key,
                        name: data[key].name,
                        grade: data[key].grade || "",
                        phone: data[key].phone || "",
                        guardianPhone: data[key].guardianPhone || "",
                        notes: data[key].notes || "",
                        records: data[key].records || {}
                    });
                }
            }
        }
        
        filterStudentsList();
        updateDashboardStats();
        updateAnalyticsDashboard();
        
        // Update currently selected student profile details if updated in Firebase
        if (selectedStudent) {
            const updated = allStudents.find(s => s.academicId === selectedStudent.academicId);
            if (updated) {
                selectedStudent = updated;
                renderMonthlyRecords();
            } else {
                selectedStudent = null;
                if (sectionStudentProfile) sectionStudentProfile.classList.add("hidden");
            }
        }
    });

    // 4. Listen to teacher directory records
    const teachersRef = db.ref("teachers");
    teachersRef.on("value", (snapshot) => {
        const data = snapshot.val();
        allTeachers = [];
        
        if (data) {
            for (const key in data) {
                if (data.hasOwnProperty(key)) {
                    allTeachers.push({
                        academicId: key,
                        name: data[key].name,
                        subject: data[key].subject || "",
                        phone: data[key].phone || "",
                        notes: data[key].notes || ""
                    });
                }
            }
        }
        
        if (teachersListBody) renderTeachersList(allTeachers);
        updateDashboardStats();
    });
}

// Setup Form Elements Action Events
function setupEventHandlers() {
    // Students Events
    btnSave.addEventListener("click", saveStudent);
    btnEdit.addEventListener("click", editStudent);
    btnDelete.addEventListener("click", deleteStudent);
    btnClear.addEventListener("click", clearForm);
    btnManualSearch.addEventListener("click", () => checkAndLoadStudent(inputAcademicId.value.trim()));

    // Live input sanitization for phone numbers (only numbers 0-9, max 11 digits)
    [inputPhone, guardianPhone, inputTeacherPhone].forEach(inputEl => {
        if (inputEl) {
            inputEl.addEventListener("input", (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
            });
        }
    });

    inputAcademicId.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            checkAndLoadStudent(inputAcademicId.value.trim());
        }
    });
    inputSearch.addEventListener("input", () => {
        activeAttendanceStudentId = null;
        filterStudentsList();
    });
    if (filterGradeSelect) {
        filterGradeSelect.addEventListener("change", () => {
            activeAttendanceStudentId = null;
            filterStudentsList();
        });
    }
    if (filterFeeSelect) {
        filterFeeSelect.addEventListener("change", () => {
            activeAttendanceStudentId = null;
            filterStudentsList();
        });
    }
    if (filterAttendanceSelect) {
        filterAttendanceSelect.addEventListener("change", () => {
            activeAttendanceStudentId = null;
            filterStudentsList();
        });
    }
    if (btnWhatsAppUnattendedBulk) {
        btnWhatsAppUnattendedBulk.addEventListener("click", () => {
            if (!currentFilteredStudents || currentFilteredStudents.length === 0) {
                showToast("الكشف فارغ ⚠️", "لا يوجد طلاب ظاهرين في الجدول حالياً لإرسال الرسائل لهم.", "info");
                return;
            }
            openWhatsAppBulkModal();
        });
    }

    if (btnOpenWaSettings) {
        btnOpenWaSettings.addEventListener("click", () => {
            const config = getWhatsAppConfig();
            if (inputWaApiUrl) inputWaApiUrl.value = config.apiUrl;
            if (inputWaInstanceId) inputWaInstanceId.value = config.instanceId;
            if (inputWaToken) inputWaToken.value = config.token;

            const currentProv = config.provider || "local";
            const radioLoc = document.getElementById("radio-provider-local");
            const radioUlt = document.getElementById("radio-provider-ultramsg");
            const radioCall = document.getElementById("radio-provider-callmebot");
            const radioWhats = document.getElementById("radio-provider-whatsauto");
            const cardLoc = document.getElementById("card-provider-local");
            const cardUlt = document.getElementById("card-provider-ultramsg");
            const cardCall = document.getElementById("card-provider-callmebot");
            const cardWhats = document.getElementById("card-provider-whatsauto");

            [cardLoc, cardUlt, cardCall, cardWhats].forEach(c => c && c.classList.remove("active"));

            if (currentProv === "ultramsg") {
                if (radioUlt) radioUlt.checked = true;
                if (cardUlt) cardUlt.classList.add("active");
            } else if (currentProv === "whatsauto") {
                if (radioWhats) radioWhats.checked = true;
                if (cardWhats) cardWhats.classList.add("active");
            } else if (currentProv === "callmebot") {
                if (radioCall) radioCall.checked = true;
                if (cardCall) cardCall.classList.add("active");
            } else {
                if (radioLoc) radioLoc.checked = true;
                if (cardLoc) cardLoc.classList.add("active");
            }

            if (waModalOverlay) waModalOverlay.classList.remove("hidden");
        });
    }

    const cardLoc = document.getElementById("card-provider-local");
    const cardUlt = document.getElementById("card-provider-ultramsg");
    const cardCall = document.getElementById("card-provider-callmebot");
    const cardWhats = document.getElementById("card-provider-whatsauto");
    const radioLoc = document.getElementById("radio-provider-local");
    const radioUlt = document.getElementById("radio-provider-ultramsg");
    const radioCall = document.getElementById("radio-provider-callmebot");
    const radioWhats = document.getElementById("radio-provider-whatsauto");

    if (cardLoc) {
        cardLoc.addEventListener("click", () => {
            if (radioLoc) radioLoc.checked = true;
            [cardLoc, cardUlt, cardCall, cardWhats].forEach(c => c && c.classList.remove("active"));
            cardLoc.classList.add("active");
            if (inputWaApiUrl) inputWaApiUrl.value = "http://localhost:3000/send";
            if (inputWaInstanceId) inputWaInstanceId.value = "";
            if (inputWaToken) inputWaToken.value = "";
        });
    }

    if (cardUlt) {
        cardUlt.addEventListener("click", () => {
            if (radioUlt) radioUlt.checked = true;
            [cardLoc, cardUlt, cardCall, cardWhats].forEach(c => c && c.classList.remove("active"));
            cardUlt.classList.add("active");
            if (inputWaApiUrl) inputWaApiUrl.value = "https://api.ultramsg.com/instance188259/messages/chat";
            if (inputWaInstanceId) inputWaInstanceId.value = "instance188259";
            if (inputWaToken) inputWaToken.value = "0o0d69ndrg6kjver";
        });
    }

    if (cardWhats) {
        cardWhats.addEventListener("click", () => {
            if (radioWhats) radioWhats.checked = true;
            [cardLoc, cardUlt, cardCall, cardWhats].forEach(c => c && c.classList.remove("active"));
            cardWhats.classList.add("active");
            if (inputWaApiUrl) inputWaApiUrl.value = "http://192.168.1.100:8080/send";
            if (inputWaInstanceId) inputWaInstanceId.value = "";
            if (inputWaToken) inputWaToken.value = "";
        });
    }

    if (cardCall) {
        cardCall.addEventListener("click", () => {
            if (radioCall) radioCall.checked = true;
            [cardLoc, cardUlt, cardCall, cardWhats].forEach(c => c && c.classList.remove("active"));
            cardCall.classList.add("active");
            if (inputWaApiUrl) inputWaApiUrl.value = "https://api.callmebot.com/whatsapp.php";
            if (inputWaInstanceId) inputWaInstanceId.value = "";
            if (inputWaToken) inputWaToken.value = "";
        });
    }

    if (btnCloseWaModal) {
        btnCloseWaModal.addEventListener("click", () => {
            if (waModalOverlay) waModalOverlay.classList.add("hidden");
        });
    }

    if (btnSaveWaConfig) {
        btnSaveWaConfig.addEventListener("click", () => {
            let selectedProv = "local";
            if (radioUlt && radioUlt.checked) selectedProv = "ultramsg";
            else if (radioWhats && radioWhats.checked) selectedProv = "whatsauto";
            else if (radioCall && radioCall.checked) selectedProv = "callmebot";

            const url = inputWaApiUrl ? inputWaApiUrl.value : "";
            const inst = inputWaInstanceId ? inputWaInstanceId.value : "";
            const tok = inputWaToken ? inputWaToken.value : "";
            saveWhatsAppConfig(selectedProv, url, inst, tok);
            showToast("تم الحفظ بنجاح 🟢", `تم تفعيل خدمة ${selectedProv.toUpperCase()} بنجاح.`, "success");
            if (waModalOverlay) waModalOverlay.classList.add("hidden");
        });
    }

    if (btnTestWaConfig) {
        btnTestWaConfig.addEventListener("click", () => {
            const testStudent = { name: "طالب تجريبي", guardianPhone: "01000000000" };
            sendWhatsAppAbsentNotice(testStudent, "1");
        });
    }

    const btnPresetCallmebot = document.getElementById("btn-preset-callmebot");
    if (btnPresetCallmebot) {
        btnPresetCallmebot.addEventListener("click", () => {
            if (cardCall) cardCall.click();
            showToast("تعبئة CallMeBot ⚡", "تم اختيار CallMeBot. قم بكتابة الـ API Key الخاص بك في خانة (كود الأمان) واضغط حفظ.", "info");
        });
    }
    if (filterMonthSelect) {
        filterMonthSelect.addEventListener("change", (e) => {
            selectedMonth = e.target.value;
            filterStudentsList();
        });
    }
    if (activeSessionSelect) {
        activeSessionSelect.addEventListener("change", () => {
            filterStudentsList();
        });
    }

    // Teachers Events
    if (btnTeacherSave) btnTeacherSave.addEventListener("click", saveTeacher);
    if (btnTeacherEdit) btnTeacherEdit.addEventListener("click", editTeacher);
    if (btnTeacherDelete) btnTeacherDelete.addEventListener("click", deleteTeacher);
    if (btnTeacherClear) btnTeacherClear.addEventListener("click", clearTeacherForm);
    if (btnTeacherManualSearch) btnTeacherManualSearch.addEventListener("click", () => {
        if (inputTeacherAcademicId) checkAndLoadTeacher(inputTeacherAcademicId.value.trim());
    });
    if (inputTeacherAcademicId) {
        inputTeacherAcademicId.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                checkAndLoadTeacher(inputTeacherAcademicId.value.trim());
            }
        });
    }
    if (inputTeacherSearch) inputTeacherSearch.addEventListener("input", filterTeachersList);
}

// Setup Navigation Tabs
function setupTabs() {
    if (tabStudents) {
        tabStudents.addEventListener("click", () => {
            activeTab = "students";
            tabStudents.classList.add("active");
            if (tabTeachers) tabTeachers.classList.remove("active");
            
            if (sectionStudentForm) sectionStudentForm.classList.remove("hidden");
            if (sectionStudentList) sectionStudentList.classList.remove("hidden");
            if (sectionAnalyticsDashboard) sectionAnalyticsDashboard.classList.add("hidden");
            
            // Show student profile if one was loaded
            if (selectedStudent) {
                if (sectionStudentProfile) sectionStudentProfile.classList.remove("hidden");
            } else {
                if (sectionStudentProfile) sectionStudentProfile.classList.add("hidden");
            }
        });
    }

    if (tabTeachers) {
        tabTeachers.addEventListener("click", () => {
            activeTab = "dashboard";
            tabTeachers.classList.add("active");
            if (tabStudents) tabStudents.classList.remove("active");
            
            if (sectionStudentForm) sectionStudentForm.classList.add("hidden");
            if (sectionStudentList) sectionStudentList.classList.add("hidden");
            if (sectionStudentProfile) sectionStudentProfile.classList.add("hidden");
            if (sectionAnalyticsDashboard) sectionAnalyticsDashboard.classList.remove("hidden");

            updateAnalyticsDashboard();
        });
    }
}

// Setup Student Profile Events
function setupProfileEvents() {
    if (profileMonthSelect) {
        profileMonthSelect.addEventListener("change", (e) => {
            selectedMonth = e.target.value;
            renderMonthlyRecords();
        });
    }
    
    if (paymentPaidCheckbox) {
        paymentPaidCheckbox.addEventListener("change", (e) => {
            updatePaymentLabel(e.target.checked);
        });
    }

    if (btnSavePayment) btnSavePayment.addEventListener("click", saveMonthlyPayment);
    if (btnQuickAttend) btnQuickAttend.addEventListener("click", quickAttendToday);
}

// Database Action: Check if Student Exists and Load Details
// Form ReadOnly Helpers
function setStudentFormReadOnly(isReadOnly) {
    inputName.disabled = isReadOnly;
    inputGrade.disabled = isReadOnly;
    inputPhone.disabled = isReadOnly;
    guardianPhone.disabled = isReadOnly;
    studentNotes.disabled = isReadOnly;
}

function setTeacherFormReadOnly(isReadOnly) {
    if (inputTeacherName) inputTeacherName.disabled = isReadOnly;
    if (inputTeacherSubject) inputTeacherSubject.disabled = isReadOnly;
    if (inputTeacherPhone) inputTeacherPhone.disabled = isReadOnly;
    if (inputTeacherNotes) inputTeacherNotes.disabled = isReadOnly;
}

// Button Helpers
function triggerSaveButtonGlow() {
    if (btnSave) {
        btnSave.disabled = false;
    }
}

function removeSaveButtonGlow() {
    // Glow disabled per user request
}

// Edit Button Toggle State Helper (Swaps Edit -> Save Modification)
function setEditButtonState(isEditing) {
    if (!btnEdit) return;
    if (isEditing) {
        btnEdit.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> حفظ التعديل`;
        btnEdit.classList.remove("btn-warning");
        btnEdit.classList.add("btn-success");
    } else {
        btnEdit.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> تعديل`;
        btnEdit.classList.remove("btn-success");
        btnEdit.classList.add("btn-warning");
    }
}

// Database Action: Check if Student Exists and Load Details
async function checkAndLoadStudent(academicId) {
    if (!academicId) {
        showToast("تنبيه", "يرجى إدخال الرقم الأكاديمي للبحث عنه", "error");
        return;
    }
    
    const studentRef = db.ref(`students/${academicId}`);
    try {
        const snapshot = await studentRef.get();
        if (snapshot.exists()) {
            const student = snapshot.val();
            student.academicId = academicId;
            selectedStudent = student;
            
            inputAcademicId.value = academicId;
            inputName.value = student.name || "";
            inputGrade.value = student.grade || "";
            inputPhone.value = student.phone || "";
            guardianPhone.value = student.guardianPhone || "";
            studentNotes.value = student.notes || "";
            updateAllSelectStates();
            
            // Lock fields until "تعديل" button is explicitly clicked
            setStudentFormReadOnly(true);
            setEditButtonState(false);
            removeSaveButtonGlow();

            // Set buttons state for editing/deleting
            btnSave.disabled = true;
            btnEdit.disabled = false;
            btnDelete.disabled = false;
            
            // Set active attendance student ID to move searched student to the top of the table
            activeAttendanceStudentId = academicId;
            filterStudentsList();

            // Scroll smoothly to student basic form section
            if (sectionStudentForm) {
                sectionStudentForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            showToast("تم جلب البيانات 🟢", `تم عرض البيانات الأساسية للطالب: ${student.name}`, "success");
        } else {
            // Prepare for new addition - unlock fields
            inputName.value = "";
            inputGrade.value = "";
            inputPhone.value = "";
            guardianPhone.value = "";
            studentNotes.value = "";
            updateAllSelectStates();
            
            setStudentFormReadOnly(false);

            btnSave.disabled = false;
            btnEdit.disabled = true;
            btnDelete.disabled = true;
            
            selectedStudent = null;
            if (sectionStudentProfile) sectionStudentProfile.classList.add("hidden");
            
            showToast("طالب جديد", "الرقم الأكاديمي غير مسجل، يمكنك كتابة بيانات الطالب وإضافته.", "info");
        }
    } catch (error) {
        console.error("Firebase read error: ", error);
        showToast("خطأ في الاتصال", "حدث فشل أثناء التحقق من الطالب في قاعدة البيانات", "error");
    }
}

// Database Action: Save / Create Student
async function saveStudent() {
    const id = inputAcademicId.value.trim();
    const name = inputName.value.trim();
    const grade = inputGrade.value;
    const phone = inputPhone.value.trim();
    const gPhone = guardianPhone.value.trim();
    const notes = studentNotes.value.trim();

    if (!id || !name || !grade || !phone || !gPhone) {
        showToast("حقول ناقصة", "يرجى ملء جميع الحقول المطلوبة لحفظ الطالب", "error");
        return;
    }

    // If editing existing selected student, save updates directly via editStudent()
    if (selectedStudent && String(selectedStudent.academicId).trim() === String(id).trim()) {
        editStudent();
        return;
    }

    // Phone Validation: Must be exactly 11 digits
    const phoneRegex = /^\d{11}$/;
    if (!phoneRegex.test(phone)) {
        showToast("رقم هاتف الطالب غير صالح ⚠️", "يجب أن يتكون رقم هاتف الطالب من 11 رقماً بالضبط (مثال: 01012345678)", "error");
        inputPhone.focus();
        return;
    }

    if (!phoneRegex.test(gPhone)) {
        showToast("رقم هاتف ولي الأمر غير صالح ⚠️", "يجب أن يتكون رقم هاتف ولي الأمر من 11 رقماً بالضبط (مثال: 01012345678)", "error");
        guardianPhone.focus();
        return;
    }

    // Duplicate Academic ID Check 1: Check local array
    const existingLocal = allStudents.find(s => String(s.academicId).trim() === String(id).trim());
    if (existingLocal) {
        showToast("الرقم الأكاديمي مكرر ⚠️", `الرقم الأكاديمي (${id}) مسجل بالفعل للطالب: (${existingLocal.name}). لا يمكن التكرار نهائياً!`, "error");
        inputAcademicId.focus();
        return;
    }

    // Duplicate Academic ID Check 2: Check Firebase DB directly
    try {
        const snapshot = await db.ref(`students/${id}`).get();
        if (snapshot.exists()) {
            const data = snapshot.val();
            showToast("الرقم الأكاديمي مكرر ⚠️", `الرقم الأكاديمي (${id}) مسجل بالفعل للطالب: (${data.name || id}). لا يمكن التكرار نهائياً!`, "error");
            inputAcademicId.focus();
            return;
        }
    } catch (error) {
        console.error("Firebase read error during save: ", error);
    }

    const studentRef = db.ref(`students/${id}`);
    studentRef.set({
        name: name,
        grade: grade,
        phone: phone,
        guardianPhone: gPhone,
        notes: notes
    })
    .then(() => {
        showToast("تم الحفظ بنجاح 🟢", `تم إضافة الطالب ${name} بنجاح برقم أكاديمي: ${id}`, "success");
        removeSaveButtonGlow();
        clearForm();
    })
    .catch((error) => {
        console.error(error);
        showToast("فشل الحفظ", `خطأ: ${error.message}`, "error");
    });
}

// Database Action: Edit / Update Student
function editStudent() {
    // If student form is locked, clicking edit unlocks the fields for editing and changes button to "حفظ التعديل"
    if (inputName.disabled) {
        setStudentFormReadOnly(false);
        inputName.focus();
        setEditButtonState(true);
        triggerSaveButtonGlow();
        showToast("وضع التعديل مفعل ✏️", "تم فتح بيانات الطالب للتعديل. قم بإجراء التغييرات ثم اضغط زر 'حفظ التعديل' للحفظ.", "info");
        return;
    }

    const id = inputAcademicId.value.trim();
    const name = inputName.value.trim();
    const grade = inputGrade.value;
    const phone = inputPhone.value.trim();
    const gPhone = guardianPhone.value.trim();
    const notes = studentNotes.value.trim();

    if (!id || !name || !grade || !phone || !gPhone) {
        showToast("حقول ناقصة", "يرجى التأكد من ملء جميع الحقول المطلوبة", "error");
        return;
    }

    // Phone Validation: Must be exactly 11 digits
    const phoneRegex = /^\d{11}$/;
    if (!phoneRegex.test(phone)) {
        showToast("رقم هاتف الطالب غير صالح ⚠️", "يجب أن يتكون رقم هاتف الطالب من 11 رقماً بالضبط (مثال: 01012345678)", "error");
        inputPhone.focus();
        return;
    }

    if (!phoneRegex.test(gPhone)) {
        showToast("رقم هاتف ولي الأمر غير صالح ⚠️", "يجب أن يتكون رقم هاتف ولي الأمر من 11 رقماً بالضبط (مثال: 01012345678)", "error");
        guardianPhone.focus();
        return;
    }

    const studentRef = db.ref(`students/${id}`);
    studentRef.update({
        name: name,
        grade: grade,
        phone: phone,
        guardianPhone: gPhone,
        notes: notes
    })
    .then(() => {
        showToast("تم التعديل بنجاح 🟢", `تم تعديل بيانات الطالب ${name} بنجاح.`, "success");
        setStudentFormReadOnly(true);
        setEditButtonState(false);
        removeSaveButtonGlow();
    })
    .catch((error) => {
        console.error(error);
        showToast("فشل التعديل", `خطأ: ${error.message}`, "error");
    });
}

// Database Action: Delete Student
async function deleteStudent() {
    const id = inputAcademicId.value.trim();
    const name = inputName.value.trim();

    if (!id) return;

    const confirmed = await showConfirmModal({
        title: "حذف طالب نهائياً",
        message: `هل أنت متأكد من رغبتك في حذف الطالب ${name || id} نهائياً؟`,
        confirmText: "حذف نهائياً",
        type: "danger"
    });

    if (confirmed) {
        const studentRef = db.ref(`students/${id}`);
        studentRef.remove()
        .then(() => {
            showToast("تم الحذف", `تمت إزالة الطالب ${name || id} من قاعدة البيانات.`, "success");
            clearForm();
        })
        .catch((error) => {
            console.error(error);
            showToast("فشل الحذف", `خطأ: ${error.message}`, "error");
        });
    }
}

// Clear Form Input Fields
function clearForm() {
    inputAcademicId.value = "";
    inputName.value = "";
    inputGrade.value = "";
    inputPhone.value = "";
    guardianPhone.value = "";
    studentNotes.value = "";
    
    // Unlock fields for fresh addition
    setStudentFormReadOnly(false);

    // Reset buttons
    btnSave.disabled = false;
    btnEdit.disabled = true;
    btnDelete.disabled = true;
    
    inputAcademicId.classList.remove("pulse-highlight");
    
    selectedStudent = null;
    activeAttendanceStudentId = null;
    updateAllSelectStates();
    setEditButtonState(false);
    removeSaveButtonGlow();
    filterStudentsList();
    if (sectionStudentProfile) sectionStudentProfile.classList.add("hidden");
}

// Database Action: Quick Attend Student Session
function quickAttendStudentSession(studentId, sessionNum) {
    if (!studentId) return;

    const sNum = sessionNum || (activeSessionSelect ? activeSessionSelect.value : "1");
    const todayDate = new Date().toLocaleDateString('ar-EG');
    const sessionPath = `students/${studentId}/records/${selectedMonth}/sessions/${sNum}`;
    
    db.ref(sessionPath).update({
        attended: true,
        attendanceDate: todayDate
    }).then(() => {
        const student = allStudents.find(s => s.academicId === studentId);
        if (student) {
            if (!student.records) student.records = {};
            if (!student.records[selectedMonth]) student.records[selectedMonth] = { paid: false, sessions: {} };
            if (!student.records[selectedMonth].sessions) student.records[selectedMonth].sessions = {};
            if (!student.records[selectedMonth].sessions[sNum]) student.records[selectedMonth].sessions[sNum] = {};
            
            student.records[selectedMonth].sessions[sNum].attended = true;
            student.records[selectedMonth].sessions[sNum].attendanceDate = todayDate;
        }

        const studentName = student ? student.name : studentId;
        showToast("تم تسجيل الحضور 🟢", `تم تسجيل حضور الطالب: ${studentName}`, "success");
        
        activeAttendanceStudentId = studentId;
        filterStudentsList();

        setTimeout(() => {
            const mainRow = document.querySelector(`.student-main-row[data-id="${studentId}"]`);
            if (mainRow) {
                mainRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                mainRow.classList.add("pulse-highlight-row");
                setTimeout(() => mainRow.classList.remove("pulse-highlight-row"), 3000);
            }
        }, 100);
    }).catch(error => {
        console.error(error);
        showToast("خطأ", "فشل تسجيل الحضور في قاعدة البيانات", "error");
    });
}

function toggleSessionAttendance(studentId, sessionNum, isAttended) {
    const todayDate = isAttended ? new Date().toLocaleDateString('ar-EG') : "";
    const sessionRef = db.ref(`students/${studentId}/records/${selectedMonth}/sessions/${sessionNum}`);
    
    sessionRef.update({
        attended: isAttended,
        attendanceDate: todayDate
    }).then(() => {
        updateLocalStudentSession(studentId, sessionNum, { attended: isAttended, attendanceDate: todayDate });
        filterStudentsList();
    });
}

function updateSessionExamGrade(studentId, sessionNum, gradeVal) {
    const sessionRef = db.ref(`students/${studentId}/records/${selectedMonth}/sessions/${sessionNum}`);
    const updates = { examGrade: gradeVal };
    let autoAttended = false;

    if (gradeVal.trim() !== "") {
        updates.attended = true;
        updates.attendanceDate = new Date().toLocaleDateString('ar-EG');
        autoAttended = true;
    }

    sessionRef.update(updates).then(() => {
        updateLocalStudentSession(studentId, sessionNum, updates);
        if (autoAttended) {
            showToast("تم تسجيل الدرجة والحضور", `تم إدخال الدرجة وتحضير الطالب تلقائياً (الحصة ${sessionNum})`, "success");
        }
        filterStudentsList();
    });
}

function getArabicMonthName(monthStr) {
    const monthMap = {
        "01": "شهر 1",
        "02": "شهر 2",
        "03": "شهر 3",
        "04": "شهر 4",
        "05": "شهر 5",
        "06": "شهر 6",
        "07": "شهر 7",
        "08": "شهر 8",
        "09": "شهر 9",
        "10": "شهر 10",
        "11": "شهر 11",
        "12": "شهر 12"
    };

    if (filterMonthSelect && filterMonthSelect.selectedIndex >= 0) {
        const optText = filterMonthSelect.options[filterMonthSelect.selectedIndex].textContent.trim();
        if (optText) return optText;
    }

    if (monthStr && monthStr.includes('-')) {
        const m = monthStr.split('-')[1];
        if (monthMap[m]) return monthMap[m];
    }

    return "هذا الشهر";
}

function toggleMonthlyPayment(studentId, isPaid) {
    const todayDate = isPaid ? new Date().toLocaleDateString('ar-EG') : "";
    const payRef = db.ref(`students/${studentId}/records/${selectedMonth}`);
    payRef.update({
        paid: isPaid,
        paymentDate: todayDate
    }).then(() => {
        const student = allStudents.find(s => s.academicId === studentId);
        if (student) {
            if (!student.records) student.records = {};
            if (!student.records[selectedMonth]) student.records[selectedMonth] = { sessions: {} };
            student.records[selectedMonth].paid = isPaid;
            student.records[selectedMonth].paymentDate = todayDate;
        }
        const mName = getArabicMonthName(selectedMonth);
        const dateSuffix = (isPaid && todayDate) ? ` <span class="fee-date-tag">(بتاريخ ${todayDate})</span>` : "";
        const statusText = isPaid ? `تم دفع مصروفات شهر ${mName}${dateSuffix}` : `لم يتم دفع مصروفات شهر ${mName}`;
        showToast("تحديث المصروفات", statusText, isPaid ? "success" : "info");
        
        // Update Main Row DOM elements in-place
        const mainTr = document.querySelector(`.student-main-row[data-id="${studentId}"]`);
        if (mainTr) {
            const mainChk = mainTr.querySelector(".chk-fee-main");
            const mainToggle = mainTr.querySelector(".fee-main-toggle");
            const mainLabel = mainTr.querySelector(".fee-main-label");
            const mainIcon = mainTr.querySelector(".fee-main-icon");

            if (mainChk) mainChk.checked = isPaid;
            if (mainToggle) {
                mainToggle.className = `fee-main-toggle ${isPaid ? 'paid' : 'unpaid'}`;
                mainToggle.title = isPaid ? `تم دفع المصروفات لشهر ${mName}` : `لم يتم دفع المصروفات لشهر ${mName}`;
            }
            if (mainIcon) {
                mainIcon.className = `fa-solid ${isPaid ? 'fa-circle-check' : 'fa-circle-xmark'} fee-main-icon`;
            }
            if (mainLabel) {
                mainLabel.textContent = isPaid ? 'تم الدفع' : 'لم يدفع';
            }
        }

        // Update Subrow DOM elements in-place
        const subTr = document.querySelector(`.student-attendance-subrow[data-id="${studentId}"]`);
        if (subTr) {
            const subChk = subTr.querySelector(".chk-fee-status");
            if (subChk) subChk.checked = isPaid;
            const badge = subTr.querySelector(".fee-status-badge");
            if (badge) {
                badge.className = `fee-status-badge ${isPaid ? 'paid' : 'unpaid'}`;
                badge.innerHTML = `<i class="fa-solid ${isPaid ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${statusText}`;
            }
        }
    });
}

function updateLocalStudentSession(studentId, sessionNum, updates) {
    const student = allStudents.find(s => s.academicId === studentId);
    if (!student) return;
    if (!student.records) student.records = {};
    if (!student.records[selectedMonth]) student.records[selectedMonth] = { paid: false, sessions: {} };
    if (!student.records[selectedMonth].sessions) student.records[selectedMonth].sessions = {};
    if (!student.records[selectedMonth].sessions[sessionNum]) student.records[selectedMonth].sessions[sessionNum] = {};
    
    Object.assign(student.records[selectedMonth].sessions[sessionNum], updates);
}

// Render Table Data for Students
function renderStudentsList(list) {
    studentsListBody.innerHTML = "";
    studentCountText.textContent = list.length;

    if (list.length === 0) {
        studentsListBody.innerHTML = `
            <tr class="table-empty-row">
                <td colspan="4">
                    <div class="empty-state-container">
                        <i class="fa-solid fa-users-slash"></i>
                        <span>لا يوجد طلاب مسجلين حالياً</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const currentActiveSess = activeSessionSelect ? activeSessionSelect.value : "1";

    list.forEach(student => {
        const monthRec = (student.records && student.records[selectedMonth]) || { paid: false, sessions: {} };
        const isPaid = monthRec.paid || false;

        // Check if student is present for the active session
        const activeSessData = (monthRec.sessions && monthRec.sessions[currentActiveSess]) || {};
        const isPresentForActiveSess = activeSessData.attended || false;

        const attendBtnIcon = isPresentForActiveSess ? 'fa-circle-check' : 'fa-user-check';
        const attendBtnText = isPresentForActiveSess ? `تم حضور (حصة ${currentActiveSess})` : `حضور (حصة ${currentActiveSess})`;
        const attendBtnClass = `btn-table-action btn-quick-attend-action ${isPresentForActiveSess ? 'attended' : ''}`;

        // Main Student Row
        const mainTr = document.createElement("tr");
        mainTr.className = "student-main-row";
        mainTr.setAttribute("data-id", student.academicId);
        
        // Attendance Sub Row (Only visible if this student is selected/searched!)
        const isSelectedForAttendance = (activeAttendanceStudentId === student.academicId);

        mainTr.innerHTML = `
            <td><strong>${escapeHTML(student.academicId)}</strong></td>
            <td><span class="student-name-title">${escapeHTML(student.name)}</span></td>
            <td>${escapeHTML(student.grade || "غير محدد")}</td>
            <td class="actions-col">
                <div class="actions-col-cell">
                    <label class="fee-main-toggle ${isPaid ? 'paid' : 'unpaid'}" title="تغيير حالة المصروفات لشهر ${getArabicMonthName(selectedMonth)}">
                        <input type="checkbox" class="chk-fee-main" data-id="${student.academicId}" ${isPaid ? 'checked' : ''}>
                        <i class="fa-solid ${isPaid ? 'fa-circle-check' : 'fa-circle-xmark'} fee-main-icon"></i>
                        <span class="fee-main-label">${isPaid ? 'تم الدفع' : 'لم يدفع'}</span>
                    </label>
                    <button class="${attendBtnClass}" title="حضور الحصة ${currentActiveSess}">
                        <i class="fa-solid ${attendBtnIcon}"></i> ${attendBtnText}
                    </button>
                    <button class="btn-table-action btn-whatsapp-action" title="إرسال إشعار غياب عبر الواتساب لولي الأمر">
                        <i class="fa-brands fa-whatsapp"></i>
                    </button>
                    <button class="btn-toggle-subrow ${isSelectedForAttendance ? 'is-open' : ''}" title="عرض/إخفاء الحضور والمصروفات" data-id="${student.academicId}">
                        <i class="fa-solid ${isSelectedForAttendance ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                    </button>
                </div>
            </td>
        `;

        const subTr = document.createElement("tr");
        subTr.className = `student-attendance-subrow ${isSelectedForAttendance ? '' : 'hidden'}`;
        subTr.setAttribute("data-id", student.academicId);

        let sessionsHtml = "";
        for (let i = 1; i <= 8; i++) {
            const sData = (monthRec.sessions && monthRec.sessions[i]) || {};
            const isAttended = sData.attended || false;
            const gradeVal = sData.examGrade !== undefined ? sData.examGrade : "";
            const isActiveTarget = String(i) === String(currentActiveSess);

            sessionsHtml += `
                <div class="session-box-compact ${isAttended ? 'is-attended' : ''} ${isActiveTarget ? 'is-active-target' : ''}">
                    <label class="chk-session-label">
                        <input type="checkbox" class="chk-session-input" data-id="${student.academicId}" data-session="${i}" ${isAttended ? 'checked' : ''}>
                        <span class="session-num-lbl">حصة ${i}</span>
                    </label>
                    <div class="grade-input-box">
                        <input type="number" class="exam-grade-input-mini" data-id="${student.academicId}" data-session="${i}" placeholder="الدرجة" value="${gradeVal}">
                    </div>
                </div>
            `;
        }

        const mName = getArabicMonthName(selectedMonth);
        const pDate = monthRec.paymentDate || "";
        const dateSuffix = (isPaid && pDate) ? ` <span class="fee-date-tag">(بتاريخ ${pDate})</span>` : "";
        const feeStatusText = isPaid ? `تم دفع مصروفات شهر ${mName}${dateSuffix}` : `لم يتم دفع مصروفات شهر ${mName}`;

        subTr.innerHTML = `
            <td colspan="4" class="attendance-subrow-cell">
                <div class="attendance-card-inline">
                    <div class="sessions-8-grid">
                        ${sessionsHtml}
                    </div>
                    <div class="attendance-card-footer">
                        <div class="fee-toggle-box">
                            <label class="switch-sm">
                                <input type="checkbox" class="chk-fee-status" data-id="${student.academicId}" ${isPaid ? 'checked' : ''}>
                                <span class="slider-sm"></span>
                            </label>
                            <span class="fee-status-badge ${isPaid ? 'paid' : 'unpaid'}">
                                <i class="fa-solid ${isPaid ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                                ${feeStatusText}
                            </span>
                        </div>
                    </div>
                </div>
            </td>
        `;

        // Action Events for Main Row Buttons
        const feeMainChk = mainTr.querySelector(".chk-fee-main");
        if (feeMainChk) {
            feeMainChk.addEventListener("change", async (e) => {
                e.stopPropagation();
                const sId = e.target.getAttribute("data-id");
                const isChecking = e.target.checked;
                const mName = getArabicMonthName(selectedMonth);
                const actionMsg = isChecking ? `تأكيد دفع مصروفات شهر ${mName}` : `إلغاء دفع مصروفات شهر ${mName}`;
                
                const confirmed = await showConfirmModal({
                    title: isChecking ? "تأكيد دفع المصروفات" : "إلغاء دفع المصروفات",
                    message: `هل أنت متأكد من ${actionMsg} للطالب: (${student.name})؟`,
                    confirmText: isChecking ? "تأكيد الدفع" : "تأكيد الإلغاء",
                    type: isChecking ? "primary" : "warning"
                });

                if (!confirmed) {
                    e.target.checked = !isChecking;
                    return;
                }

                toggleMonthlyPayment(sId, isChecking);
            });
        }

        mainTr.querySelector(".btn-quick-attend-action").addEventListener("click", (e) => {
            e.stopPropagation();
            if (isPresentForActiveSess) {
                toggleSessionAttendance(student.academicId, currentActiveSess, false);
            } else {
                quickAttendStudentSession(student.academicId, currentActiveSess);
            }
        });

        const waBtn = mainTr.querySelector(".btn-whatsapp-action");
        if (waBtn) {
            waBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openWhatsAppBulkModal([student]);
            });
        }

        // Event listener for Subrow Toggle Button (Down/Up Chevron Arrow)
        const toggleBtn = mainTr.querySelector(".btn-toggle-subrow");
        if (toggleBtn) {
            toggleBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const icon = toggleBtn.querySelector("i");
                const isHidden = subTr.classList.contains("hidden");
                
                if (isHidden) {
                    subTr.classList.remove("hidden");
                    toggleBtn.classList.add("is-open");
                    if (icon) icon.className = "fa-solid fa-chevron-up";
                    activeAttendanceStudentId = student.academicId;
                } else {
                    subTr.classList.add("hidden");
                    toggleBtn.classList.remove("is-open");
                    if (icon) icon.className = "fa-solid fa-chevron-down";
                    if (activeAttendanceStudentId === student.academicId) {
                        activeAttendanceStudentId = null;
                    }
                }
            });
        }

        // Double-click listener on student row / name to load data into main basic form
        mainTr.addEventListener("dblclick", (e) => {
            if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".fee-main-toggle") || e.target.closest("label")) return;
            inputAcademicId.value = student.academicId;
            checkAndLoadStudent(student.academicId);
        });

        // Event listeners for session checkboxes
        subTr.querySelectorAll(".chk-session-input").forEach(chk => {
            chk.addEventListener("change", (e) => {
                const sId = e.target.getAttribute("data-id");
                const sNum = e.target.getAttribute("data-session");
                toggleSessionAttendance(sId, sNum, e.target.checked);
            });
        });

        // Event listeners for exam grade inputs (change)
        subTr.querySelectorAll(".exam-grade-input-mini").forEach(input => {
            input.addEventListener("change", (e) => {
                const sId = e.target.getAttribute("data-id");
                const sNum = e.target.getAttribute("data-session");
                updateSessionExamGrade(sId, sNum, e.target.value);
            });
        });

        // Event listener for monthly fee toggle
        const feeChk = subTr.querySelector(".chk-fee-status");
        if (feeChk) {
            feeChk.addEventListener("change", async (e) => {
                const sId = e.target.getAttribute("data-id");
                const isChecking = e.target.checked;
                const actionMsg = isChecking ? `تأكيد دفع مصروفات شهر ${mName}` : `إلغاء دفع مصروفات شهر ${mName}`;
                
                const confirmed = await showConfirmModal({
                    title: isChecking ? "تأكيد دفع المصروفات" : "إلغاء دفع المصروفات",
                    message: `هل أنت متأكد من ${actionMsg} للطالب: (${student.name})؟`,
                    confirmText: isChecking ? "تأكيد الدفع" : "تأكيد الإلغاء",
                    type: isChecking ? "primary" : "warning"
                });

                if (!confirmed) {
                    e.target.checked = !isChecking;
                    return;
                }

                toggleMonthlyPayment(sId, isChecking);
            });
        }

        studentsListBody.appendChild(mainTr);
        studentsListBody.appendChild(subTr);
    });
}

// Client-side Search and Filter logic for Students
function filterStudentsList() {
    const query = inputSearch.value.trim().toLowerCase();
    const selectedGrade = filterGradeSelect ? filterGradeSelect.value : "";
    const selectedFeeStatus = filterFeeSelect ? filterFeeSelect.value : "";
    
    let filtered = allStudents;

    if (selectedGrade) {
        filtered = filtered.filter(student => student.grade === selectedGrade);
    }

    if (selectedFeeStatus) {
        filtered = filtered.filter(student => {
            const monthRec = (student.records && student.records[selectedMonth]) || {};
            const isPaid = monthRec.paid || false;
            if (selectedFeeStatus === "paid") return isPaid === true;
            if (selectedFeeStatus === "unpaid") return isPaid === false;
            return true;
        });
    }

    const selectedAttendanceStatus = filterAttendanceSelect ? filterAttendanceSelect.value : "";
    const currentActiveSess = activeSessionSelect ? activeSessionSelect.value : "1";

    if (selectedAttendanceStatus) {
        filtered = filtered.filter(student => {
            const monthRec = (student.records && student.records[selectedMonth]) || {};
            const activeSessData = (monthRec.sessions && monthRec.sessions[currentActiveSess]) || {};
            const isPresent = activeSessData.attended === true;
            if (selectedAttendanceStatus === "attended") return isPresent === true;
            if (selectedAttendanceStatus === "unattended") return isPresent === false;
            return true;
        });
    }

    if (query) {
        filtered = filtered.filter(student => {
            return student.name.toLowerCase().includes(query) ||
                student.academicId.toLowerCase().includes(query) ||
                (student.grade && student.grade.toLowerCase().includes(query));
        });
    }

    // If a specific student was searched by Academic ID or scanned, bring them to the VERY TOP of the table!
    if (activeAttendanceStudentId) {
        const searchedIndex = filtered.findIndex(student => student.academicId === activeAttendanceStudentId);
        if (searchedIndex > -1) {
            const [searchedStudent] = filtered.splice(searchedIndex, 1);
            filtered.unshift(searchedStudent); // Prepend searched student to position #1 (Index 0)
        } else {
            const targetStudent = allStudents.find(student => student.academicId === activeAttendanceStudentId);
            if (targetStudent) {
                filtered.unshift(targetStudent);
            }
        }
    }

    currentFilteredStudents = filtered;

    if (btnWhatsAppUnattendedBulk && unattendedCountBadge) {
        unattendedCountBadge.textContent = toEnglishDigits(filtered.length);
    }

    renderStudentsList(filtered);
}

// --- TEACHERS CODE ACTIONS ---

// Database Action: Check if Teacher Exists and Load Details
async function checkAndLoadTeacher(academicId) {
    if (!academicId || !inputTeacherName) {
        if (!academicId) showToast("تنبيه", "يرجى إدخال الرقم الأكاديمي للمعلم للبحث عنه", "error");
        return;
    }
    
    showToast("جاري الاستعلام...", `البحث عن الرقم: ${academicId}`, "info");
    
    const teacherRef = db.ref(`teachers/${academicId}`);
    try {
        const snapshot = await teacherRef.get();
        if (snapshot.exists()) {
            const teacher = snapshot.val();
            
            if (inputTeacherName) inputTeacherName.value = teacher.name || "";
            if (inputTeacherSubject) inputTeacherSubject.value = teacher.subject || "";
            if (inputTeacherPhone) inputTeacherPhone.value = teacher.phone || "";
            if (inputTeacherNotes) inputTeacherNotes.value = teacher.notes || "";
            
            setTeacherFormReadOnly(true);

            // Set buttons state for editing/deleting
            if (btnTeacherSave) btnTeacherSave.disabled = true;
            if (btnTeacherEdit) btnTeacherEdit.disabled = false;
            if (btnTeacherDelete) btnTeacherDelete.disabled = false;
            
            showToast("معلم مسجل", `تم العثور على المعلم: ${teacher.name} (انقر 'تعديل' لفتح البيانات للتعديل)`, "success");
        } else {
            // Prepare for new addition
            if (inputTeacherName) inputTeacherName.value = "";
            if (inputTeacherSubject) inputTeacherSubject.value = "";
            if (inputTeacherPhone) inputTeacherPhone.value = "";
            if (inputTeacherNotes) inputTeacherNotes.value = "";
            
            setTeacherFormReadOnly(false);

            if (btnTeacherSave) btnTeacherSave.disabled = false;
            if (btnTeacherEdit) btnTeacherEdit.disabled = true;
            if (btnTeacherDelete) btnTeacherDelete.disabled = true;
            
            showToast("معلم جديد", "الرقم الأكاديمي غير مسجل، يمكنك كتابة بيانات المعلم وإضافته.", "info");
        }
    } catch (error) {
        console.error("Firebase read error: ", error);
        showToast("خطأ في الاتصال", "حدث فشل أثناء التحقق من المعلم في قاعدة البيانات", "error");
    }
}

// Database Action: Save / Create Teacher
function saveTeacher() {
    if (!inputTeacherAcademicId || !inputTeacherName) return;
    const id = inputTeacherAcademicId.value.trim();
    const name = inputTeacherName.value.trim();
    const subject = inputTeacherSubject ? inputTeacherSubject.value.trim() : "";
    const phone = inputTeacherPhone ? inputTeacherPhone.value.trim() : "";
    const notes = inputTeacherNotes ? inputTeacherNotes.value.trim() : "";

    if (!id || !name || !subject || !phone) {
        showToast("حقول ناقصة", "يرجى ملء جميع الحقول الأساسية لحفظ المعلم", "error");
        return;
    }

    const teacherRef = db.ref(`teachers/${id}`);
    teacherRef.set({
        name: name,
        subject: subject,
        phone: phone,
        notes: notes
    })
    .then(() => {
        showToast("تم الحفظ بنجاح", `تم إضافة المعلم ${name} بنجاح إلى قاعدة البيانات.`, "success");
        clearTeacherForm();
    })
    .catch((error) => {
        console.error(error);
        showToast("فشل الحفظ", `خطأ: ${error.message}`, "error");
    });
}

// Database Action: Edit / Update Teacher
function editTeacher() {
    if (!inputTeacherAcademicId || !inputTeacherName) return;
    if (inputTeacherName.disabled) {
        setTeacherFormReadOnly(false);
        inputTeacherName.focus();
        showToast("وضع التعديل مفعل", "تم فتح بيانات المعلم للتعديل. انقر 'تعديل' للحفظ بعد إجراء التغييرات.", "info");
        return;
    }

    const id = inputTeacherAcademicId.value.trim();
    const name = inputTeacherName.value.trim();
    const subject = inputTeacherSubject ? inputTeacherSubject.value.trim() : "";
    const phone = inputTeacherPhone ? inputTeacherPhone.value.trim() : "";
    const notes = inputTeacherNotes ? inputTeacherNotes.value.trim() : "";

    if (!id || !name || !subject || !phone) {
        showToast("حقول ناقصة", "يرجى التأكد من ملء جميع الحقول الأساسية", "error");
        return;
    }

    const teacherRef = db.ref(`teachers/${id}`);
    teacherRef.update({
        name: name,
        subject: subject,
        phone: phone,
        notes: notes
    })
    .then(() => {
        showToast("تم التعديل بنجاح", `تم تعديل بيانات المعلم ${name} بنجاح.`, "success");
        setTeacherFormReadOnly(true);
    })
    .catch((error) => {
        console.error(error);
        showToast("فشل التعديل", `خطأ: ${error.message}`, "error");
    });
}

// Database Action: Delete Teacher
async function deleteTeacher() {
    if (!inputTeacherAcademicId) return;
    const id = inputTeacherAcademicId.value.trim();
    const name = inputTeacherName ? inputTeacherName.value.trim() : "";

    if (!id) return;

    const confirmed = await showConfirmModal({
        title: "حذف معلم نهائياً",
        message: `هل أنت متأكد من رغبتك في حذف المعلم ${name || id} نهائياً؟`,
        confirmText: "حذف نهائياً",
        type: "danger"
    });

    if (confirmed) {
        const teacherRef = db.ref(`teachers/${id}`);
        teacherRef.remove()
        .then(() => {
            showToast("تم الحذف", `تمت إزالة المعلم ${name || id} من قاعدة البيانات.`, "success");
            clearTeacherForm();
        })
        .catch((error) => {
            console.error(error);
            showToast("فشل الحذف", `خطأ: ${error.message}`, "error");
        });
    }
}

// Clear Teacher Form
function clearTeacherForm() {
    if (inputTeacherAcademicId) inputTeacherAcademicId.value = "";
    if (inputTeacherName) inputTeacherName.value = "";
    if (inputTeacherSubject) inputTeacherSubject.value = "";
    if (inputTeacherPhone) inputTeacherPhone.value = "";
    if (inputTeacherNotes) inputTeacherNotes.value = "";
    
    setTeacherFormReadOnly(false);

    // Reset buttons
    if (btnTeacherSave) btnTeacherSave.disabled = false;
    if (btnTeacherEdit) btnTeacherEdit.disabled = true;
    if (btnTeacherDelete) btnTeacherDelete.disabled = true;
    
    if (inputTeacherAcademicId) inputTeacherAcademicId.classList.remove("pulse-highlight");
}

// Render Table Data for Teachers
function renderTeachersList(list) {
    if (!teachersListBody) return;
    teachersListBody.innerHTML = "";
    if (teacherCountText) teacherCountText.textContent = list.length;

    if (list.length === 0) {
        teachersListBody.innerHTML = `
            <tr class="table-empty-row">
                <td colspan="5">
                    <div class="empty-state-container">
                        <i class="fa-solid fa-users-slash"></i>
                        <span>لا يوجد معلمون مسجلون حالياً</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    list.forEach(teacher => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${escapeHTML(teacher.academicId)}</strong></td>
            <td>${escapeHTML(teacher.name)}</td>
            <td>${escapeHTML(teacher.subject)}</td>
            <td>${escapeHTML(teacher.phone)}</td>
            <td class="actions-col">
                <div class="actions-col-cell">
                    <button class="btn-table-action edit" title="تعديل">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="btn-table-action delete" title="حذف">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
    
        // Click on edit action inside table
        tr.querySelector(".btn-table-action.edit").addEventListener("click", (e) => {
            e.stopPropagation();
            inputTeacherAcademicId.value = teacher.academicId;
            inputTeacherName.value = teacher.name;
            inputTeacherSubject.value = teacher.subject;
            inputTeacherPhone.value = teacher.phone;
            inputTeacherNotes.value = teacher.notes || "";
            
            setTeacherFormReadOnly(true);

            btnTeacherSave.disabled = true;
            btnTeacherEdit.disabled = false;
            btnTeacherDelete.disabled = false;
            
            // Scroll to form smoothly on mobile
            document.getElementById("teacher-form-section").scrollIntoView({ behavior: 'smooth' });
        });

        // Click on delete action inside table
        tr.querySelector(".btn-table-action.delete").addEventListener("click", (e) => {
            e.stopPropagation();
            inputTeacherAcademicId.value = teacher.academicId;
            inputTeacherName.value = teacher.name;
            deleteTeacher();
        });

        teachersListBody.appendChild(tr);
    });
}

// Client-side Search and Filter logic for Teachers
function filterTeachersList() {
    const query = inputTeacherSearch.value.trim().toLowerCase();
    
    if (!query) {
        renderTeachersList(allTeachers);
        return;
    }

    const filtered = allTeachers.filter(teacher => {
        return teacher.name.toLowerCase().includes(query) || 
               teacher.academicId.toLowerCase().includes(query) ||
               (teacher.subject && teacher.subject.toLowerCase().includes(query));
    });

    renderTeachersList(filtered);
}

// --- STUDENT DETAILED ACADEMIC & FINANCIAL PROFILE LOGIC ---

// Load Student profile and configure panel
function loadStudentProfile(student) {
    selectedStudent = student;
    if (!sectionStudentProfile) return;
    
    sectionStudentProfile.classList.remove("hidden");
    
    if (profileStudentName) profileStudentName.textContent = student.name;
    if (profileStudentId) profileStudentId.innerHTML = `<strong>الرقم الأكاديمي:</strong> ${escapeHTML(student.academicId)}`;
    if (profileStudentGrade) profileStudentGrade.innerHTML = `<strong>الصف الدراسي:</strong> ${escapeHTML(student.grade || "غير محدد")}`;
    if (profileStudentPhone) profileStudentPhone.innerHTML = `<strong>رقم الهاتف:</strong> ${escapeHTML(student.phone || "لا يوجد")}`;
    
    renderMonthlyRecords();
    
    // Smoothly scroll profile panel into view
    sectionStudentProfile.scrollIntoView({ behavior: 'smooth' });
}

// Render dynamic attendance (8 sessions) and payment values for the selected month
function renderMonthlyRecords() {
    if (!selectedStudent) return;
    
    const records = selectedStudent.records || {};
    const monthData = records[selectedMonth] || { paid: false, paidAmount: 0, sessions: {} };
    
    // Payments
    paymentPaidCheckbox.checked = monthData.paid || false;
    paymentAmountInput.value = monthData.paidAmount || 0;
    updatePaymentLabel(monthData.paid || false);
    
    // 8 Sessions Grid render
    sessionsGridContainer.innerHTML = "";
    for (let i = 1; i <= 8; i++) {
        const session = (monthData.sessions && monthData.sessions[i]) || { attended: false, examGrade: "", attendanceDate: "" };
        const card = document.createElement("div");
        card.className = `session-card ${session.attended ? 'attended' : ''}`;
        
        const badgeClass = session.attended ? 'attended' : 'absent';
        const badgeText = session.attended ? 'حاضر' : 'غائب';
        const dateText = session.attendanceDate ? `التاريخ: ${session.attendanceDate}` : 'لم يحضر بعد';
        const gradeVal = session.examGrade !== undefined ? session.examGrade : '';
        
        card.innerHTML = `
            <div class="session-card-header">
                <span class="session-title">الحصة ${i}</span>
                <span class="session-status-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="session-card-body">
                <span class="session-date-text">${dateText}</span>
                <div class="session-grade-input-group">
                    <label>درجة الامتحان:</label>
                    <input type="number" class="session-grade-input" id="grade-input-${i}" value="${gradeVal}" min="0" max="100">
                </div>
                <div class="session-actions">
                    ${!session.attended ? `
                        <button class="btn-session-action mark-present" onclick="quickMarkAttendance(${i}, true)">
                            <i class="fa-solid fa-check"></i> حضور
                        </button>
                    ` : `
                        <button class="btn-session-action mark-absent" onclick="quickMarkAttendance(${i}, false)">
                            <i class="fa-solid fa-xmark"></i> غياب
                        </button>
                    `}
                    <button class="btn-session-save" onclick="saveSessionGrade(${i})">حفظ</button>
                </div>
            </div>
        `;
        sessionsGridContainer.appendChild(card);
    }
}

// Quick Mark attendance for student (1-8 sessions)
function quickMarkAttendance(sessionId, attended) {
    if (!selectedStudent) return;
    
    const academicId = selectedStudent.academicId;
    const dateStr = attended ? new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' }) : "";
    
    db.ref(`students/${academicId}/records/${selectedMonth}/sessions/${sessionId}/attended`).set(attended);
    db.ref(`students/${academicId}/records/${selectedMonth}/sessions/${sessionId}/attendanceDate`).set(dateStr)
    .then(() => {
        showToast("تحديث الحضور", `تم تسجيل الحصة ${sessionId} كـ ${attended ? 'حضور' : 'غياب'} للثنائي الأكاديمي ${academicId}`, "success");
    })
    .catch(error => {
        showToast("خطأ", error.message, "error");
    });
}

// Save specific session exam grade
function saveSessionGrade(sessionId) {
    if (!selectedStudent) return;
    
    const academicId = selectedStudent.academicId;
    const gradeInput = document.getElementById(`grade-input-${sessionId}`);
    const gradeVal = gradeInput.value.trim();
    
    if (gradeVal === "") {
        db.ref(`students/${academicId}/records/${selectedMonth}/sessions/${sessionId}/examGrade`).remove()
        .then(() => {
            showToast("تم إزالة الدرجة", `تم مسح درجة امتحان الحصة ${sessionId}`, "success");
        });
        return;
    }
    
    const grade = parseFloat(gradeVal);
    if (isNaN(grade) || grade < 0) {
        showToast("خطأ", "يرجى إدخال درجة صحيحة", "error");
        return;
    }
    
    db.ref(`students/${academicId}/records/${selectedMonth}/sessions/${sessionId}/examGrade`).set(grade)
    .then(() => {
        showToast("حفظ الدرجة", `تم تسجيل الدرجة (${grade}) بنجاح للحصة ${sessionId}`, "success");
    })
    .catch(error => {
        showToast("خطأ", error.message, "error");
    });
}

// Quick Attend Today action (Marks the first unoccupied session as present today)
function quickAttendToday() {
    if (!selectedStudent) {
        showToast("تنبيه", "يرجى اختيار طالب أولاً", "error");
        return;
    }
    
    const records = selectedStudent.records || {};
    const monthData = records[selectedMonth] || { sessions: {} };
    const sessions = monthData.sessions || {};
    
    let targetSessionId = -1;
    for (let i = 1; i <= 8; i++) {
        if (!sessions[i] || !sessions[i].attended) {
            targetSessionId = i;
            break;
        }
    }
    
    if (targetSessionId === -1) {
        showToast("تنبيه", "جميع الحصص الـ 8 مسجلة كحضور بالفعل لهذا الشهر!", "warning");
        return;
    }
    
    quickMarkAttendance(targetSessionId, true);
}

// Save payment info
async function saveMonthlyPayment() {
    if (!selectedStudent) return;
    
    const academicId = selectedStudent.academicId;
    const paid = paymentPaidCheckbox.checked;
    const amountVal = paymentAmountInput.value.trim();
    const amount = amountVal === "" ? 0 : parseFloat(amountVal);
    const todayDate = paid ? new Date().toLocaleDateString('ar-EG') : "";
    const mName = getArabicMonthName(selectedMonth);

    const actionText = paid ? `تأكيد دفع مصروفات شهر ${mName}` : `إلغاء دفع مصروفات شهر ${mName}`;
    const confirmed = await showConfirmModal({
        title: paid ? "تأكيد دفع المصروفات" : "إلغاء دفع المصروفات",
        message: `هل أنت متأكد من ${actionText} للطالب: (${selectedStudent.name})؟`,
        confirmText: paid ? "تأكيد الدفع" : "تأكيد الإلغاء",
        type: paid ? "primary" : "warning"
    });

    if (!confirmed) {
        return;
    }
    
    if (isNaN(amount) || amount < 0) {
        showToast("خطأ", "يرجى إدخال مبلغ دفع صالح", "error");
        return;
    }
    
    db.ref(`students/${academicId}/records/${selectedMonth}`).update({
        paid: paid,
        paidAmount: amount,
        paymentDate: todayDate
    }).then(() => {
        if (selectedStudent.records && selectedStudent.records[selectedMonth]) {
            selectedStudent.records[selectedMonth].paid = paid;
            selectedStudent.records[selectedMonth].paidAmount = amount;
            selectedStudent.records[selectedMonth].paymentDate = todayDate;
        }
        showToast("تم حفظ المدفوعات", `تم حفظ حالة الدفع لشهر ${selectedMonth}`, "success");
    })
    .catch(error => {
        showToast("خطأ", error.message, "error");
    });
}

// Update UI payment status toggle label
function updatePaymentLabel(paid) {
    if (paid) {
        paymentStatusLabel.textContent = "تم دفع مصروفات الشهر";
        paymentStatusLabel.className = "payment-status-label paid";
    } else {
        paymentStatusLabel.textContent = "غير مدفوع للشهر المختار";
        paymentStatusLabel.className = "payment-status-label unpaid";
    }
}

// Update stats panels
function updateDashboardStats() {
    if (statTotalStudents) statTotalStudents.textContent = allStudents.length;
    if (statTotalTeachers) statTotalTeachers.textContent = allTeachers.length;
    
    if (!statTodayAttendance) return;

    // Count student attendance for today
    let todayCount = 0;
    const todayDateStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' });
    
    allStudents.forEach(student => {
        const records = student.records || {};
        for (const month in records) {
            const sessions = records[month].sessions || {};
            for (const sessId in sessions) {
                if (sessions[sessId].attended && sessions[sessId].attendanceDate === todayDateStr) {
                    todayCount++;
                }
            }
        }
    });
    
    statTodayAttendance.textContent = todayCount;
}

// Toast Notifications System
function showToast(title, message, type = "info") {
    const container = document.getElementById("toast-container");
    if (container) {
        container.innerHTML = ""; // Clear old toasts to prevent stacking multiple notifications
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let iconHtml = '<i class="fa-solid fa-circle-info toast-icon"></i>';
    if (type === "success") {
        iconHtml = '<i class="fa-solid fa-circle-check toast-icon"></i>';
    } else if (type === "error") {
        iconHtml = '<i class="fa-solid fa-circle-xmark toast-icon"></i>';
    }

    toast.innerHTML = `
        ${iconHtml}
        <div class="toast-body">
            <div class="toast-title">${escapeHTML(title)}</div>
            <div class="toast-message">${escapeHTML(message)}</div>
        </div>
    `;

    container.appendChild(toast);

    // Slide out and remove toast
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-120%)";
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

// WhatsApp Phone Formatter Helper Function
function formatWhatsAppPhone(phoneStr) {
    if (!phoneStr) return "";
    let cleaned = phoneStr.replace(/\D/g, '');
    if (!cleaned) return "";
    
    if (cleaned.startsWith('0')) {
        cleaned = '2' + cleaned;
    } else if (!cleaned.startsWith('20') && cleaned.length === 10) {
        cleaned = '20' + cleaned;
    }
    return cleaned;
}

// WhatsApp Configuration State & Auto-Send Gateway Helper Functions
function getWhatsAppConfig() {
    const provider = localStorage.getItem("wa_provider") || "local";
    let apiUrl = localStorage.getItem("wa_api_url");
    let instanceId = localStorage.getItem("wa_instance_id");
    let token = localStorage.getItem("wa_token");

    if (provider === "local" && !apiUrl) {
        apiUrl = "http://localhost:3000/send";
    } else if (provider === "ultramsg" && !apiUrl) {
        apiUrl = "https://api.ultramsg.com/instance188259/messages/chat";
        instanceId = "instance188259";
        token = "0o0d69ndrg6kjver";
    }

    return {
        provider,
        apiUrl: apiUrl || "",
        instanceId: instanceId || "",
        token: token || ""
    };
}

function saveWhatsAppConfig(provider, apiUrl, instanceId, token) {
    localStorage.setItem("wa_provider", provider);
    localStorage.setItem("wa_api_url", apiUrl.trim());
    localStorage.setItem("wa_instance_id", instanceId.trim());
    localStorage.setItem("wa_token", token.trim());
}

async function sendWhatsAppAbsentNotice(student, sessionNum) {
    if (!student) return;
    const targetPhone = student.guardianPhone || student.phone || "";
    const cleanPhone = formatWhatsAppPhone(targetPhone);
    
    if (!cleanPhone) {
        showToast("رقم الهاتف غير متاح", `لا يوجد رقم هاتف متاح لولي أمر الطالب: ${student.name}`, "error");
        return;
    }

    const sNumText = sessionNum ? ` (الحصة ${sessionNum})` : "";
    const message = `السلام عليكم ورحمة الله وبركاته،\n\nالطالب/ة: ${student.name}\nلم يتم حضورة درس اللغة العربية اليوم${sNumText} تحت إشراف مستر هيثم.`;
    
    const config = getWhatsAppConfig();
    let rawUrl = config.apiUrl ? config.apiUrl.trim() : "";
    let instanceId = config.instanceId ? config.instanceId.trim() : "";
    let token = config.token ? config.token.trim() : "";

    // Auto extract Instance ID if pasted in raw URL (e.g., https://api.ultramsg.com/instance188259)
    if (rawUrl.includes("ultramsg.com")) {
        const instMatch = rawUrl.match(/(instance\d+)/i);
        if (instMatch && !instanceId) {
            instanceId = instMatch[1];
        }
    }

    // Check if background gateway API is configured
    if (rawUrl || (instanceId && token)) {
        try {
            showToast("جاري الإرسال التلقائي...", `جاري إرسال الإشعار لولي أمر ${student.name} عبر الواتساب...`, "info");
            
            let fetchUrl = rawUrl;
            let reqOptions = {};

            // 0. Handling Local WhatsApp Gateway Server
            if (rawUrl.includes("localhost:3000") || rawUrl.includes("127.0.0.1:3000") || config.provider === "local") {
                fetchUrl = rawUrl || "http://127.0.0.1:3000/send";
                reqOptions = {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "X-API-KEY": "IbnAlSaqr_Secured_WA_Key_2026_x89"
                    },
                    body: JSON.stringify({
                        phone: cleanPhone,
                        to: cleanPhone,
                        message: message,
                        body: message
                    })
                };
            }
            // 1. Handling WhatsAuto Mobile App Gateway
            else if (rawUrl.includes("whatsauto") || config.provider === "whatsauto") {
                fetchUrl = rawUrl || "http://192.168.1.100:8080/send";
                reqOptions = {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        phone: "+" + cleanPhone,
                        to: "+" + cleanPhone,
                        message: message,
                        text: message
                    })
                };
            }
            // 1. Handling CallMeBot Free Gateway
            else if (rawUrl.includes("callmebot.com")) {
                const apiKey = token || instanceId;
                const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone;
                fetchUrl = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(formattedPhone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apiKey)}`;
                reqOptions = { method: "GET", mode: "no-cors" };
            }
            // 1. Handling UltraMsg Gateway API
            else if (rawUrl.includes("ultramsg.com") || (instanceId && instanceId.startsWith("instance"))) {
                let inst = instanceId || "instance188259";
                if (!inst && rawUrl.includes("instance")) {
                    const parts = rawUrl.split('/');
                    const foundInst = parts.find(p => p.startsWith("instance"));
                    if (foundInst) inst = foundInst;
                }
                
                // Formulate exact UltraMsg chat endpoint
                fetchUrl = `https://api.ultramsg.com/${inst}/messages/chat`;

                const urlParams = new URLSearchParams();
                if (token) urlParams.append("token", token);
                urlParams.append("to", "+" + cleanPhone);
                urlParams.append("body", message);
                urlParams.append("priority", "10");

                reqOptions = {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: urlParams
                };
            }
            // 2. Handling Green API Gateway
            else if (rawUrl.includes("green-api.com") || rawUrl.includes("greenapi")) {
                if (!rawUrl.includes("sendMessage")) {
                    fetchUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
                }
                reqOptions = {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chatId: `${cleanPhone}@c.us`,
                        message: message
                    })
                };
            }
            // 3. Generic Custom Gateway API (JSON POST)
            else {
                reqOptions = {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        to: "+" + cleanPhone,
                        phone: cleanPhone,
                        body: message,
                        message: message,
                        token: token,
                        instance_id: instanceId
                    })
                };
            }

            const response = await fetch(fetchUrl, reqOptions);
            const resData = await response.json().catch(() => ({}));

            if (response.ok || response.status === 200 || response.status === 201 || (resData && (resData.success === true || resData.sent === "true" || resData.id || resData.status === "success"))) {
                showToast("تم الإرسال التلقائي 🟢", `تم إرسال إشعار الغياب بنجاح عبر الواتساب للطالب: ${student.name}`, "success");
            } else {
                console.warn("WhatsApp API Gateway response non-OK: ", resData);
                showToast("لم يتم الإرسال 🔴", `فشل الإرسال للطالب: ${student.name} (${resData.error || 'تأكد من تشغيل السيرفر'}).`, "error");
            }
        } catch (err) {
            console.error("WhatsApp API Error: ", err);
            showToast("سيرفر الواتساب المحلي غير متصل 🔴", "يرجى تشغيل ملف (start-whatsapp-server.bat) على جهازك للإرسال التلقائي دون فتح تابات.", "error");
        }
    } else {
        showToast("تنبيه الإعدادات ⚠️", "يرجى تحديد طريقة الإرسال من زر (ربط الواتساب ⚙️) أعلى الصفحة.", "warning");
    }
}

function openWhatsAppDirectLink(cleanPhone, message) {
    const encodedMsg = encodeURIComponent(message);
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
    window.open(waUrl, '_blank');
}

// Download Report Card PNG Image Helper
function downloadReportImage(dataUrl, fileName) {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName || "student_report.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Populate Hidden Student Performance Report Card HTML (Image 2 Replica)
function populateReportCardHTML(student) {
    if (!student) return;

    const reportStudentName = document.getElementById("report-student-name");
    const reportStudentId = document.getElementById("report-student-id");
    const reportStudentGrade = document.getElementById("report-student-grade");
    const reportStudentPhone = document.getElementById("report-student-phone");
    const reportDate = document.getElementById("report-date");
    const reportMonthSubject = document.getElementById("report-month-subject");
    const reportTableBody = document.getElementById("report-table-body");
    const reportAttendedCount = document.getElementById("report-attended-count");
    const reportPaidAmount = document.getElementById("report-paid-amount");
    const reportTeacherNotes = document.getElementById("report-teacher-notes");

    if (reportStudentName) reportStudentName.textContent = student.name || "طالب";
    if (reportStudentId) reportStudentId.textContent = toEnglishDigits(student.academicId || "");
    if (reportStudentGrade) reportStudentGrade.textContent = student.grade || "الصف الأول الإعدادي";
    if (reportStudentPhone) reportStudentPhone.textContent = toEnglishDigits(student.guardianPhone || student.phone || "---");

    const todayStr = new Date().toLocaleDateString('en-GB');
    if (reportDate) reportDate.textContent = toEnglishDigits(todayStr);

    const monthText = getSelectedMonthText();
    if (reportMonthSubject) reportMonthSubject.textContent = `${monthText} في مادة اللغة العربية`;

    const monthRec = (student.records && student.records[selectedMonth]) || { paid: false, paidAmount: 0, sessions: {} };
    const sessions = monthRec.sessions || {};

    let attendedCount = 0;
    let tableHtml = "";

    for (let i = 1; i <= 8; i++) {
        const sess = sessions[i] || {};
        const isAttended = sess.attended === true;
        if (isAttended) attendedCount++;

        const sessDate = sess.attendanceDate ? toEnglishDigits(sess.attendanceDate) : "---";
        
        let activityText = `حصة ${i}`;
        if (sess.examGrade) activityText = `حصة ${i} + امتحان`;
        if (!isAttended) activityText = `غياب`;

        let gradeText = "---";
        if (sess.examGrade) {
            gradeText = `<strong style="color: #10b981;">${toEnglishDigits(sess.examGrade)} / 20</strong>`;
        }

        tableHtml += `
            <tr>
                <td>${sessDate}</td>
                <td>${activityText}</td>
                <td>${gradeText}</td>
            </tr>
        `;
    }

    if (reportTableBody) reportTableBody.innerHTML = tableHtml;
    if (reportAttendedCount) reportAttendedCount.textContent = toEnglishDigits(attendedCount);

    const reportFinancialStatus = document.getElementById("report-financial-status");
    const reportSummaryBarFinancial = document.getElementById("report-summary-bar-financial");

    if (reportFinancialStatus) {
        if (monthRec.paid) {
            reportFinancialStatus.innerHTML = `<strong>السجل المالي:</strong> تم دفع المصروفات لـ (${monthText}) بنجاح`;
            if (reportSummaryBarFinancial) reportSummaryBarFinancial.className = "report-summary-bar green";
        } else {
            reportFinancialStatus.innerHTML = `<strong>السجل المالي:</strong> لم يتم سداد المصروفات لـ (${monthText}) حتى الآن`;
            if (reportSummaryBarFinancial) reportSummaryBarFinancial.className = "report-summary-bar orange";
        }
    }
}

// Generic WhatsApp Message Sender for Custom Templates
async function sendWhatsAppCustomNotice(student, messageTemplate) {
    if (!student) return false;
    const targetPhone = student.guardianPhone || student.phone || "";
    const cleanPhone = formatWhatsAppPhone(targetPhone);
    
    if (!cleanPhone) {
        showToast("رقم الهاتف غير متاح ⚠️", `لا يوجد رقم هاتف متاح لولي أمر الطالب: ${student.name}`, "error");
        return false;
    }

    const monthText = getSelectedMonthText();
    const sessionText = getSelectedSessionText();

    const monthRec = (student.records && student.records[selectedMonth]) || { paid: false, paidAmount: 0, sessions: {} };
    const sessions = monthRec.sessions || {};
    let attendedCount = 0;
    for (let i = 1; i <= 8; i++) {
        if (sessions[i] && sessions[i].attended) attendedCount++;
    }

    const paidStatusText = monthRec.paid ? `تم سداد المصروفات بنجاح (${monthRec.paidAmount || 100} ج.م)` : `لم يتم السداد حتى الآن`;
    const notesText = student.notes && student.notes.trim() ? student.notes.trim() : "الطالب يتابع دروسه بانتظام واجتهاد.";

    const message = messageTemplate
        .replace(/\{student_name\}/g, student.name)
        .replace(/\{name\}/g, student.name)
        .replace(/\[اسم الطالب\]/g, student.name)
        .replace(/\{month_name\}/g, monthText)
        .replace(/\{month\}/g, monthText)
        .replace(/\[الشهر\]/g, monthText)
        .replace(/\{session_name\}/g, sessionText)
        .replace(/\{session\}/g, sessionText)
        .replace(/\[الحصة\]/g, sessionText)
        .replace(/\{attended_count\}/g, toEnglishDigits(attendedCount))
        .replace(/\{total_sessions\}/g, "8")
        .replace(/\{paid_status\}/g, paidStatusText)
        .replace(/\{paid_summary\}/g, paidStatusText)
        .replace(/\{notes\}/g, notesText);

    // Populate Report Card HTML
    populateReportCardHTML(student);

    // Render report card HTML element into PNG Image Base64
    let imageBase64Data = "";
    try {
        const reportCardEl = document.getElementById("student-report-card");
        if (reportCardEl && typeof html2canvas === "function") {
            const canvas = await html2canvas(reportCardEl, {
                scale: 2,
                backgroundColor: "#ffffff",
                logging: false,
                useCORS: true,
                allowTaint: true
            });
            imageBase64Data = canvas.toDataURL("image/png");
        }
    } catch (e) {
        console.warn("Failed to render report card image via html2canvas:", e);
    }

    const config = getWhatsAppConfig();
    let rawUrl = config.apiUrl ? config.apiUrl.trim() : "";
    let instanceId = config.instanceId ? config.instanceId.trim() : "";
    let token = config.token ? config.token.trim() : "";

    if (!rawUrl && !instanceId && !token) {
        if (imageBase64Data) {
            downloadReportImage(imageBase64Data, `تقرير_أداء_${student.name}.png`);
            showToast("تم تحميل صورة التقرير 🖼️", `تم تنزيل صورة تقرير الطالب ${student.name}. جاري فتح محادثة الواتساب لإرفاقها...`, "info");
        }
        openWhatsAppDirectLink(cleanPhone, message);
        return true;
    }

    if (rawUrl.includes("ultramsg.com")) {
        const instMatch = rawUrl.match(/(instance\d+)/i);
        if (instMatch && !instanceId) {
            instanceId = instMatch[1];
        }
    }

    try {
        let fetchUrl = rawUrl;
        let reqOptions = {};

        if (rawUrl.includes("localhost:3000") || rawUrl.includes("127.0.0.1:3000") || config.provider === "local" || !rawUrl) {
            fetchUrl = rawUrl || "http://127.0.0.1:3000/send";
            reqOptions = {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "X-API-KEY": "IbnAlSaqr_Secured_WA_Key_2026_x89"
                },
                body: JSON.stringify({
                    phone: cleanPhone,
                    to: cleanPhone,
                    message: message,
                    body: message,
                    imageBase64: imageBase64Data
                })
            };
        } else if (rawUrl.includes("ultramsg.com") || (instanceId && instanceId.startsWith("instance"))) {
            let inst = instanceId || "instance188259";
            if (!inst && rawUrl.includes("instance")) {
                const parts = rawUrl.split('/');
                const foundInst = parts.find(p => p.startsWith("instance"));
                if (foundInst) inst = foundInst;
            }
            
            // If image exists, send to Ultramsg image endpoint
            if (imageBase64Data) {
                fetchUrl = `https://api.ultramsg.com/${inst}/messages/image`;
                const urlParams = new URLSearchParams();
                if (token) urlParams.append("token", token);
                urlParams.append("to", "+" + cleanPhone);
                urlParams.append("image", imageBase64Data);
                urlParams.append("caption", message);
                urlParams.append("priority", "10");
                reqOptions = {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: urlParams
                };
            } else {
                fetchUrl = `https://api.ultramsg.com/${inst}/messages/chat`;
                const urlParams = new URLSearchParams();
                if (token) urlParams.append("token", token);
                urlParams.append("to", "+" + cleanPhone);
                urlParams.append("body", message);
                urlParams.append("priority", "10");
                reqOptions = {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: urlParams
                };
            }
        } else if (rawUrl.includes("green-api.com") || rawUrl.includes("greenapi")) {
            if (!rawUrl.includes("sendMessage")) {
                fetchUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
            }
            reqOptions = {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chatId: `${cleanPhone}@c.us`,
                    message: message
                })
            };
        } else {
            reqOptions = {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: "+" + cleanPhone,
                    phone: cleanPhone,
                    body: message,
                    message: message,
                    token: token,
                    instance_id: instanceId
                })
            };
        }

        const response = await fetch(fetchUrl, reqOptions);
        const resData = await response.json().catch(() => ({}));

        const isSuccess = (response.ok || response.status === 200 || response.status === 201) && 
                          (resData.success === true || resData.sent === "true" || resData.id || resData.status === "success" || !resData.error);

        if (isSuccess) {
            showToast("تم الإرسال 🟢", `تم إرسال الرسالة بنجاح لـ ولي أمر: ${student.name}`, "success");
            return true;
        } else {
            console.warn("WhatsApp API Gateway response non-OK: ", resData);
            const errMsg = resData.error || 'يرجى فتح نافذة السيرفر وتأكيد الاتصال بكود QR';
            showToast("لم يتم الإرسال 🔴", `فشل الإرسال للطالب: ${student.name} (${errMsg}).`, "error");
            return false;
        }
    } catch (err) {
        console.error("WhatsApp API Error: ", err);
        showToast("سيرفر الواتساب المحلي غير متصل 🔴", "يرجى تشغيل ملف (start-whatsapp-server.bat) على جهازك للإرسال التلقائي دون فتح تابات.", "error");
        return false;
    }
}

// Setup WhatsApp Bulk 4-Message Template Selection Modal
function setupWhatsAppBulkModal() {
    const waBulkModalOverlay = document.getElementById("wa-bulk-modal-overlay");
    const btnCloseWaBulkModal = document.getElementById("btn-close-wa-bulk-modal");
    const btnCancelWaBulkSend = document.getElementById("btn-cancel-wa-bulk-send");
    const btnConfirmWaBulkSend = document.getElementById("btn-confirm-wa-bulk-send");
    const waBulkMsgPreview = document.getElementById("wa-bulk-msg-preview");
    const radios = document.querySelectorAll('input[name="wa-msg-template"]');

    if (!waBulkModalOverlay) return;

    const closeModal = () => {
        waBulkModalOverlay.classList.add("hidden");
    };

    if (btnCloseWaBulkModal) btnCloseWaBulkModal.addEventListener("click", closeModal);
    if (btnCancelWaBulkSend) btnCancelWaBulkSend.addEventListener("click", closeModal);
    
    waBulkModalOverlay.addEventListener("click", (e) => {
        if (e.target === waBulkModalOverlay) closeModal();
    });

    // Handle template option card click & radio change
    const msgCards = document.querySelectorAll(".msg-template-card");
    msgCards.forEach(card => {
        card.addEventListener("click", () => {
            const radio = card.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                selectedWaBulkTemplateKey = radio.value;
            }
            msgCards.forEach(c => c.classList.remove("active"));
            card.classList.add("active");
        });
    });

    radios.forEach(radio => {
        radio.addEventListener("change", (e) => {
            selectedWaBulkTemplateKey = e.target.value;
            msgCards.forEach(c => c.classList.remove("active"));
            const card = document.getElementById(`card-msg-${selectedWaBulkTemplateKey}`);
            if (card) card.classList.add("active");
        });
    });

    // Handle Confirm Send Button click
    if (btnConfirmWaBulkSend) {
        btnConfirmWaBulkSend.addEventListener("click", () => {
            const checkedRadio = document.querySelector('input[name="wa-msg-template"]:checked');
            const key = selectedWaBulkTemplateKey || (checkedRadio ? checkedRadio.value : null);

            if (!key) {
                showToast("يرجى اختيار رسالة ⚠️", "قم باختيار إحدى الرسائل الـ 4 أولاً للإرسال.", "warning");
                return;
            }

            if (!currentBulkTargetStudents || currentBulkTargetStudents.length === 0) {
                showToast("الكشف فارغ ⚠️", "لا يوجد طلاب محددين لإرسال الرسائل لهم.", "warning");
                closeModal();
                return;
            }

            const templates = getWaBulkTemplates();
            const templateText = templates[key];

            if (!templateText) {
                showToast("نص الرسالة فارغ ⚠️", "يرجى اختيار رسالة أو التأكد من إعدادات النص.", "warning");
                return;
            }

            closeModal();

            const count = currentBulkTargetStudents.length;
            const config = getWhatsAppConfig();
            const isBackgroundApi = !!config.apiUrl;

            currentBulkTargetStudents.forEach((student, index) => {
                setTimeout(() => {
                    sendWhatsAppCustomNotice(student, templateText);
                }, index * (isBackgroundApi ? 300 : 800));
            });

            if (count === 1) {
                const sName = currentBulkTargetStudents[0].name;
                if (isBackgroundApi) {
                    showToast("جاري الإرسال التلقائي 🟢", `جاري إرسال إشعار الواتساب لولي أمر: ${sName}...`, "success");
                } else {
                    showToast("جاري فتح الواتساب", `جاري فتح محادثة الواتساب لولي أمر: ${sName}...`, "info");
                }
            } else {
                if (isBackgroundApi) {
                    showToast("جاري الإرسال التلقائي 🟢", `جاري إرسال الرسائل في الخلفية لـ ${count} طالب...`, "success");
                } else {
                    showToast("جاري فتح الواتساب", `جاري فتح محادثات الواتساب لـ ${count} طالب...`, "info");
                }
            }
        });
    }
}

function openWhatsAppBulkModal(targetStudents = null) {
    const waBulkModalOverlay = document.getElementById("wa-bulk-modal-overlay");
    const waBulkTargetCount = document.getElementById("wa-bulk-target-count");
    const waBulkSendCount = document.getElementById("wa-bulk-send-count");
    const waBulkMsgPreview = document.getElementById("wa-bulk-msg-preview");
    
    if (!waBulkModalOverlay) return;

    currentBulkTargetStudents = targetStudents || currentFilteredStudents || [];

    const count = currentBulkTargetStudents.length;
    if (count === 0) {
        showToast("الكشف فارغ ⚠️", "لا يوجد طلاب محددين لإرسال الرسائل لهم.", "warning");
        return;
    }

    if (waBulkTargetCount) waBulkTargetCount.textContent = toEnglishDigits(count);
    if (waBulkSendCount) waBulkSendCount.textContent = toEnglishDigits(count);

    const templates = getWaBulkTemplates();

    // Update dynamic card preview text snippets
    const cardAtt = document.querySelector("#card-msg-attendance .msg-preview-text");
    const cardAbs = document.querySelector("#card-msg-absent .msg-preview-text");
    const cardPaid = document.querySelector("#card-msg-paid .msg-preview-text");
    const cardUnpaid = document.querySelector("#card-msg-unpaid .msg-preview-text");
    const cardReport = document.querySelector("#card-msg-report .msg-preview-text");

    if (cardAtt && templates.attendance) cardAtt.textContent = templates.attendance.replace("{student_name}", "[اسم الطالب]").split("\n\n")[1];
    if (cardAbs && templates.absent) cardAbs.textContent = templates.absent.replace("{student_name}", "[اسم الطالب]").split("\n\n")[1];
    if (cardPaid && templates.paid) cardPaid.textContent = templates.paid.replace("{student_name}", "[اسم الطالب]").split("\n\n")[1];
    if (cardUnpaid && templates.unpaid) cardUnpaid.textContent = templates.unpaid.replace("{student_name}", "[اسم الطالب]").split("\n\n")[1];
    if (cardReport && templates.report) cardReport.textContent = templates.report.replace("{student_name}", "[اسم الطالب]").split("\n\n")[1];

    // Unselect all options initially so user chooses explicitly
    selectedWaBulkTemplateKey = null;
    document.querySelectorAll('input[name="wa-msg-template"]').forEach(r => r.checked = false);
    document.querySelectorAll(".msg-template-card").forEach(c => c.classList.remove("active"));

    if (waBulkMsgPreview) {
        waBulkMsgPreview.value = "";
    }

    waBulkModalOverlay.classList.remove("hidden");
}

// Expose profile grid trigger functions to global window context (necessary for onclick HTML handlers)
window.quickMarkAttendance = quickMarkAttendance;
window.saveSessionGrade = saveSessionGrade;

// Setup Custom Select Clear Buttons & Dynamic State Management
function setupSelectClearButtons() {
    const wrappers = document.querySelectorAll('.custom-select-wrapper');
    
    wrappers.forEach(wrapper => {
        const select = wrapper.querySelector('select');
        const iconBox = wrapper.querySelector('.select-icon-box');
        if (!select || !iconBox) return;

        // Save default initial value on load if not explicitly set in dataset
        if (select.dataset.defaultValue === undefined) {
            select.dataset.defaultValue = select.value || "";
        }

        // Function to update icon state ('X' vs arrow down)
        const updateState = () => {
            const defaultValue = select.dataset.defaultValue !== undefined ? select.dataset.defaultValue : "";
            const currentValue = select.value;
            // A selection has been made if value is not empty and different from default
            const hasSelectedValue = currentValue !== "" && currentValue !== defaultValue;
            
            if (hasSelectedValue) {
                wrapper.classList.add('has-selected-value');
            } else {
                wrapper.classList.remove('has-selected-value');
            }
        };

        // Listen to change and input events on select
        select.addEventListener('change', updateState);
        select.addEventListener('input', updateState);

        // Icon box click listener: clear selection when 'X' is active
        iconBox.addEventListener('click', (e) => {
            if (wrapper.classList.contains('has-selected-value')) {
                e.preventDefault();
                e.stopPropagation();
                
                // Reset value back to default
                select.value = select.dataset.defaultValue !== undefined ? select.dataset.defaultValue : "";
                
                // Dispatch change and input events so filter/form listeners run
                select.dispatchEvent(new Event('change', { bubbles: true }));
                select.dispatchEvent(new Event('input', { bubbles: true }));
                
                updateState();
            }
        });

        // Initialize state on load
        updateState();
    });
}

function updateAllSelectStates() {
    document.querySelectorAll('.custom-select-wrapper select').forEach(select => {
        const wrapper = select.closest('.custom-select-wrapper');
        if (wrapper) {
            const defaultValue = select.dataset.defaultValue !== undefined ? select.dataset.defaultValue : "";
            const currentValue = select.value;
            const hasSelectedValue = currentValue !== "" && currentValue !== defaultValue;
            if (hasSelectedValue) {
                wrapper.classList.add('has-selected-value');
            } else {
                wrapper.classList.remove('has-selected-value');
            }
        }
    });
}

// --- ANALYTICS DASHBOARD CALCULATIONS & CHARTS LOGIC ---
function updateAnalyticsDashboard() {
    if (!sectionAnalyticsDashboard || sectionAnalyticsDashboard.classList.contains("hidden")) {
        // If the dashboard section is hidden, skip calculation unless active tab is "dashboard"
        if (activeTab !== "dashboard") return;
    }

    const selectedGrade = dashFilterGrade ? dashFilterGrade.value : "";
    const selectedMonthVal = dashFilterMonth ? dashFilterMonth.value : selectedMonth;

    // Filter students by grade
    let filteredStudents = allStudents;
    if (selectedGrade) {
        filteredStudents = allStudents.filter(s => s.grade === selectedGrade);
    }

    const totalCount = filteredStudents.length;

    // Active session attendance tracking
    const currentActiveSess = activeSessionSelect ? activeSessionSelect.value : "1";
    const todayDateStr = new Date().toLocaleDateString('ar-EG');

    let attendedTodayCount = 0;
    let absentTodayCount = 0;

    // Sessions 1 to 8 stats for charts
    const sessionAttendanceCounts = [0, 0, 0, 0, 0, 0, 0, 0];
    const sessionExamSum = [0, 0, 0, 0, 0, 0, 0, 0];
    const sessionExamCount = [0, 0, 0, 0, 0, 0, 0, 0];

    // Fees calculation
    let paidCount = 0;
    let paidTodayCount = 0;
    let unpaidCount = 0;

    filteredStudents.forEach(s => {
        const monthRec = (s.records && s.records[selectedMonthVal]) || { paid: false, sessions: {} };
        
        // Fee payment status
        if (monthRec.paid) {
            paidCount++;
            if (monthRec.paymentDate === todayDateStr || !monthRec.paymentDate) {
                paidTodayCount++;
            }
        } else {
            unpaidCount++;
        }

        // Active session attendance
        const activeSessData = (monthRec.sessions && monthRec.sessions[currentActiveSess]) || {};
        if (activeSessData.attended === true) {
            attendedTodayCount++;
        } else {
            absentTodayCount++;
        }

        // Sessions 1..8 calculations
        for (let i = 1; i <= 8; i++) {
            const sessData = (monthRec.sessions && monthRec.sessions[i]) || {};
            if (sessData.attended === true) {
                sessionAttendanceCounts[i - 1]++;
            }
            if (sessData.examGrade !== undefined && sessData.examGrade !== "" && !isNaN(parseFloat(sessData.examGrade))) {
                sessionExamSum[i - 1] += parseFloat(sessData.examGrade);
                sessionExamCount[i - 1]++;
            }
        }
    });

    const attendedPercentage = totalCount > 0 ? Math.round((attendedTodayCount / totalCount) * 100) : 0;
    const absentPercentage = totalCount > 0 ? Math.round((absentTodayCount / totalCount) * 100) : 0;
    const paidPercentage = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;
    const paidTodayPercentage = totalCount > 0 ? Math.round((paidTodayCount / totalCount) * 100) : 0;

    // Update KPI Card DOM
    if (kpiTotalStudents) kpiTotalStudents.textContent = totalCount;
    if (kpiGradeSubtext) kpiGradeSubtext.textContent = selectedGrade || "كافة الصفوف الدراسية";
    if (kpiAttendedToday) kpiAttendedToday.textContent = attendedTodayCount;
    if (kpiAttendedRate) kpiAttendedRate.textContent = `${attendedPercentage}% من الإجمالي (حصة ${currentActiveSess})`;
    if (kpiPaidStudents) kpiPaidStudents.textContent = paidTodayCount;
    if (kpiPaidStudentsRate) kpiPaidStudentsRate.textContent = `${paidTodayPercentage}% من إجمالي الطلاب`;
    if (kpiPaidRate) kpiPaidRate.textContent = `${paidPercentage}%`;
    if (kpiPaidCountText) kpiPaidCountText.textContent = `${paidCount} تم الدفع / ${unpaidCount} غير مدفوع`;

    // Render / Update Chart.js Charts
    if (typeof Chart === "undefined") return;

    // --- Chart 1: Attendance Chart (Bar) ---
    const ctxAttendance = document.getElementById("attendanceChart");
    if (ctxAttendance) {
        if (attendanceChartInstance) {
            attendanceChartInstance.destroy();
        }
        attendanceChartInstance = new Chart(ctxAttendance, {
            type: 'bar',
            data: {
                labels: ['الحصة 1', 'الحصة 2', 'الحصة 3', 'الحصة 4', 'الحصة 5', 'الحصة 6', 'الحصة 7', 'الحصة 8'],
                datasets: [{
                    label: 'عدد الطلاب الحاضرين',
                    data: sessionAttendanceCounts,
                    backgroundColor: 'rgba(6, 182, 212, 0.65)',
                    borderColor: '#06b6d4',
                    borderWidth: 2,
                    borderRadius: 8,
                    hoverBackgroundColor: '#06b6d4'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', font: { family: 'Tajawal', size: 12 } }
                    },
                    tooltip: {
                        titleFont: { family: 'Tajawal' },
                        bodyFont: { family: 'Tajawal' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8', font: { family: 'Tajawal' } },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#94a3b8', precision: 0, font: { family: 'Tajawal' } },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    }
                }
            }
        });
    }

    // --- Chart 2: Fees Doughnut Chart ---
    const ctxFees = document.getElementById("feesChart");
    if (ctxFees) {
        if (feesChartInstance) {
            feesChartInstance.destroy();
        }
        feesChartInstance = new Chart(ctxFees, {
            type: 'doughnut',
            data: {
                labels: ['تم دفع المصروفات', 'لم يتم الدفع'],
                datasets: [{
                    data: [paidCount, unpaidCount],
                    backgroundColor: ['#10b981', '#ef4444'],
                    borderColor: '#1e293b',
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#f8fafc', font: { family: 'Tajawal', size: 12 } }
                    }
                },
                cutout: '68%'
            }
        });
    }

    // --- Top 5 Students Performance Calculation & Render ---
    const studentPerformanceList = [];

    filteredStudents.forEach(s => {
        const monthRec = (s.records && s.records[selectedMonthVal]) || { sessions: {} };
        const sessions = monthRec.sessions || {};
        
        let sumGrades = 0;
        let countGrades = 0;

        for (let i = 1; i <= 8; i++) {
            const sessData = sessions[i];
            if (sessData && sessData.examGrade !== undefined && sessData.examGrade !== "" && !isNaN(parseFloat(sessData.examGrade))) {
                sumGrades += parseFloat(sessData.examGrade);
                countGrades++;
            }
        }

        const avgScore = countGrades > 0 ? parseFloat((sumGrades / countGrades).toFixed(1)) : 0;
        studentPerformanceList.push({
            academicId: s.academicId,
            name: s.name,
            grade: s.grade || "غير محدد",
            avgScore: avgScore,
            examCount: countGrades
        });
    });

    // Sort by avgScore descending, then by examCount descending
    studentPerformanceList.sort((a, b) => {
        if (b.avgScore !== a.avgScore) {
            return b.avgScore - a.avgScore;
        }
        return b.examCount - a.examCount;
    });

    // Filter top 5 students
    const top5Students = studentPerformanceList.slice(0, 5);

    // Render Top 5 Students DOM
    if (topStudentsListContainer) {
        topStudentsListContainer.innerHTML = "";
        
        const validTopStudents = top5Students.filter(s => s.examCount > 0 || s.avgScore > 0);

        if (validTopStudents.length === 0) {
            topStudentsListContainer.innerHTML = `
                <div class="top-students-empty">
                    <i class="fa-solid fa-graduation-cap"></i>
                    <span>لا توجد درجات اختبارات مسجلة لهذه المرحلة بعد</span>
                </div>
            `;
        } else {
            validTopStudents.forEach((student, index) => {
                const rankNum = index + 1;
                let rankClass = "rank-other";
                let rankIcon = rankNum;

                if (rankNum === 1) {
                    rankClass = "rank-1";
                    rankIcon = '<i class="fa-solid fa-crown"></i>';
                } else if (rankNum === 2) {
                    rankClass = "rank-2";
                    rankIcon = '2';
                } else if (rankNum === 3) {
                    rankClass = "rank-3";
                    rankIcon = '3';
                }

                const item = document.createElement("div");
                item.className = "top-student-item";
                item.innerHTML = `
                    <div class="rank-badge ${rankClass}">${rankIcon}</div>
                    <div class="top-student-info">
                        <span class="top-student-name">${student.name}</span>
                        <div class="top-student-details">
                            <span class="detail-id"><i class="fa-solid fa-id-card"></i> ${student.academicId}</span>
                            <span class="detail-grade"><i class="fa-solid fa-school"></i> ${student.grade}</span>
                        </div>
                    </div>
                    <div class="top-student-score">
                        <span class="score-val">${student.avgScore}</span>
                        <span class="score-unit">متوسط الدرجة</span>
                    </div>
                `;
                topStudentsListContainer.appendChild(item);
            });
        }
    }

    // --- Chart 3: Exam Grades Performance Chart (Line) ---
    const sessionExamAverages = sessionExamSum.map((sum, idx) => {
        const cnt = sessionExamCount[idx];
        return cnt > 0 ? parseFloat((sum / cnt).toFixed(1)) : 0;
    });

    const ctxGrades = document.getElementById("gradesChart");
    if (ctxGrades) {
        if (gradesChartInstance) {
            gradesChartInstance.destroy();
        }
        gradesChartInstance = new Chart(ctxGrades, {
            type: 'line',
            data: {
                labels: ['اختبار 1', 'اختبار 2', 'اختبار 3', 'اختبار 4', 'اختبار 5', 'اختبار 6', 'اختبار 7', 'اختبار 8'],
                datasets: [{
                    label: 'متوسط درجة الطلاب',
                    data: sessionExamAverages,
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#f97316',
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', font: { family: 'Tajawal', size: 12 } }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8', font: { family: 'Tajawal' } },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { color: '#94a3b8', font: { family: 'Tajawal' } },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    }
                }
            }
        });
    }
}

// System Custom Confirmation Modal (Replaces native browser confirm dialogs)
function showConfirmModal({ title, message, confirmText = "تأكيد", type = "danger" }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById("confirm-modal-overlay");
        const titleEl = document.getElementById("confirm-modal-title");
        const msgEl = document.getElementById("confirm-modal-message");
        const btnConfirm = document.getElementById("confirm-modal-btn-confirm");
        const btnCancel = document.getElementById("confirm-modal-btn-cancel");
        const btnClose = document.getElementById("confirm-modal-close");
        const btnConfirmText = document.getElementById("confirm-modal-btn-confirm-text");
        const iconBox = document.getElementById("confirm-modal-icon-box");
        const iconEl = document.getElementById("confirm-modal-icon");

        if (!overlay) {
            // Fallback if modal HTML element is not present
            resolve(window.confirm(message));
            return;
        }

        titleEl.textContent = title || "تأكيد الإجراء";
        msgEl.textContent = message || "";
        btnConfirmText.textContent = confirmText;

        // Apply type styles and icon (danger vs primary vs warning)
        if (type === "danger") {
            iconBox.className = "custom-modal-icon-box danger";
            iconEl.className = "fa-solid fa-trash-can";
            btnConfirm.className = "custom-btn btn-modal-confirm danger";
        } else if (type === "warning") {
            iconBox.className = "custom-modal-icon-box warning";
            iconEl.className = "fa-solid fa-triangle-exclamation";
            btnConfirm.className = "custom-btn btn-modal-confirm warning";
        } else {
            iconBox.className = "custom-modal-icon-box primary";
            iconEl.className = "fa-solid fa-circle-check";
            btnConfirm.className = "custom-btn btn-modal-confirm primary";
        }

        overlay.classList.remove("hidden");
        requestAnimationFrame(() => {
            overlay.classList.add("active");
        });

        const cleanup = () => {
            overlay.classList.remove("active");
            setTimeout(() => {
                overlay.classList.add("hidden");
            }, 120);
            btnConfirm.removeEventListener("click", onConfirm);
            btnCancel.removeEventListener("click", onCancel);
            if (btnClose) btnClose.removeEventListener("click", onCancel);
            overlay.removeEventListener("click", onOverlayClick);
            document.removeEventListener("keydown", onKeyDown);
        };

        const onConfirm = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        const onOverlayClick = (e) => {
            if (e.target === overlay) {
                onCancel();
            }
        };

        const onKeyDown = (e) => {
            if (e.key === "Escape") {
                onCancel();
            } else if (e.key === "Enter") {
                onConfirm();
            }
        };

        btnConfirm.addEventListener("click", onConfirm);
        btnCancel.addEventListener("click", onCancel);
        if (btnClose) btnClose.addEventListener("click", onCancel);
        overlay.addEventListener("click", onOverlayClick);
        document.addEventListener("keydown", onKeyDown);
    });
}

// Export All Student Data to Excel (.xlsx) Spreadsheet
function exportAllDataToExcel() {
    if (typeof XLSX === "undefined") {
        showToast("تنبيه ⚠️", "مكتبة تصدير الإكسيل جاري تحميلها، يرجى المحاولة مرة أخرى...", "warning");
        return;
    }

    const studentsList = currentFilteredStudents && currentFilteredStudents.length > 0 
        ? currentFilteredStudents 
        : (studentsData || []);

    if (!studentsList || studentsList.length === 0) {
        showToast("لا توجد بيانات ⚠️", "لا يوجد طلاب متاحين لتصديرهم في ملف إكسيل.", "warning");
        return;
    }

    const monthText = getSelectedMonthText();
    const excelRows = [];

    studentsList.forEach(student => {
        const monthRec = (student.records && student.records[selectedMonth]) || { paid: false, paidAmount: 0, sessions: {} };
        const sessions = monthRec.sessions || {};

        let attendedCount = 0;
        const sessionDetails = [];

        for (let i = 1; i <= 8; i++) {
            const sess = sessions[i] || {};
            if (sess.attended) attendedCount++;
            
            let sessStatus = sess.attended ? "حضور" : "غياب";
            if (sess.examGrade) {
                sessStatus += ` (امتحان: ${toEnglishDigits(sess.examGrade)})`;
            }
            sessionDetails.push(`ح${i}: ${sessStatus}`);
        }

        const paidStatusText = monthRec.paid 
            ? `تم الدفع (${toEnglishDigits(monthRec.paidAmount || 100)} ج.م)` 
            : `لم يتم الدفع`;

        excelRows.push({
            "الرقم الأكاديمي": toEnglishDigits(student.academicId || ""),
            "اسم الطالب": student.name || "",
            "الصف الدراسي": student.grade || "",
            "رقم هاتف الطالب": toEnglishDigits(student.phone || ""),
            "رقم هاتف ولي الأمر": toEnglishDigits(student.guardianPhone || ""),
            "الشهر المالي": monthText,
            "حالة المصروفات": paidStatusText,
            "عدد أيام الحضور": toEnglishDigits(attendedCount),
            "تفاصيل الحصص والاختبارات": sessionDetails.join(" | "),
            "ملاحظات": student.notes || ""
        });
    });

    try {
        const worksheet = XLSX.utils.json_to_sheet(excelRows);

        // Auto-fit column widths for clear readability in Excel
        const colWidths = [
            { wch: 16 }, // Academic ID
            { wch: 26 }, // Name
            { wch: 22 }, // Grade
            { wch: 16 }, // Student Phone
            { wch: 18 }, // Guardian Phone
            { wch: 14 }, // Month
            { wch: 22 }, // Fee Status
            { wch: 16 }, // Attendance Count
            { wch: 50 }, // Session details
            { wch: 30 }  // Notes
        ];
        worksheet["!cols"] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "بيانات الطلاب");

        const fileName = `كشف_بيانات_الطلاب_${monthText.replace(/\s+/g, '_')}.xlsx`;
        XLSX.writeFile(workbook, fileName);

        showToast("تم تصدير الإكسيل 📊🟢", `تم تصدير ${excelRows.length} طالب إلى ملف إكسيل بنجاح!`, "success");
    } catch (err) {
        console.error("Excel Export Error:", err);
        showToast("خطأ أثناء التصدير 🔴", "حدث خطأ أثناء إنشاء ملف الإكسيل.", "error");
    }
}

// Bind Export Excel Button
function initExportExcelButton() {
    const btnExportExcel = document.getElementById("btn-export-excel");
    if (btnExportExcel) {
        btnExportExcel.addEventListener("click", exportAllDataToExcel);
    }
}

// --- Firebase Authentication & Full-Screen Login System ---
let firebaseAuthCredentials = { username: "haitham", passwordHash: "9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0" }; // SHA-256 hash of "0000"

function initLoginSystem() {
    const loginOverlay = document.getElementById("login-modal-overlay");
    const loginForm = document.getElementById("login-form");
    const inputUser = document.getElementById("login-username");
    const inputPass = document.getElementById("login-password");
    const errorMsg = document.getElementById("login-error-msg");
    const btnLogout = document.getElementById("btn-logout");

    if (!loginOverlay || !loginForm) return;

    // Check Firebase for admin credentials under single node (adminAuth) & listen in real-time
    if (typeof db !== "undefined" && db) {
        db.ref("adminAuth").on("value", async (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data && data.username !== undefined && data.password !== undefined) {
                    const currentDbUser = String(data.username).trim();
                    let currentDbPass = String(data.password).trim();
                    let currentPassHash = currentDbPass;

                    // Upgrade raw plaintext password in Firebase to SHA-256 hash automatically!
                    if (currentDbPass.length !== 64 || !/^[0-9a-f]+$/i.test(currentDbPass)) {
                        currentPassHash = await hashPassword(currentDbPass);
                        db.ref("adminAuth/password").set(currentPassHash).catch(() => {});
                    }

                    firebaseAuthCredentials = {
                        username: currentDbUser,
                        passwordHash: currentPassHash
                    };

                    // Real-Time Password Change Auto Logout Check across all active devices
                    const isLoggedIn = sessionStorage.getItem("isLoggedIn") === "true";
                    const savedSessionPassHash = sessionStorage.getItem("sessionPassHash");
                    const savedSessionUser = sessionStorage.getItem("sessionUsername");

                    if (isLoggedIn && (savedSessionPassHash !== currentPassHash || savedSessionUser !== currentDbUser)) {
                        // Password or Username was updated in Firebase! Immediately invalidate session!
                        sessionStorage.removeItem("isLoggedIn");
                        sessionStorage.removeItem("sessionPassHash");
                        sessionStorage.removeItem("sessionUsername");
                        sessionStorage.removeItem("sessionPassword");

                        if (inputPass) inputPass.value = "";
                        loginOverlay.style.display = "flex";
                        loginOverlay.style.opacity = "1";

                        if (errorMsg) {
                            errorMsg.textContent = "تم تغيير كلمة المرور! يرجى تسجيل الدخول بالبيانات الجديدة 🔒";
                            errorMsg.style.display = "block";
                        }
                        showToast("تنبيه أمان ⚠️", "تم تغيير كلمة المرور، تم تسجيل الخروج تلقائياً.", "warning");
                    }
                }
            } else {
                // Initialize Firebase with default hashed credentials (SHA-256 of "0000")
                const defaultHash = await hashPassword("0000");
                db.ref("adminAuth").set({
                    username: "haitham",
                    password: defaultHash
                }).catch(() => {});
            }
        });
    }

    // Check Session Login State
    const isLoggedIn = sessionStorage.getItem("isLoggedIn") === "true";
    if (isLoggedIn) {
        loginOverlay.style.display = "none";
    } else {
        loginOverlay.style.display = "flex";
    }

    // Handle Login Submit
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const enteredUser = inputUser ? inputUser.value.trim() : "";
        const enteredPass = inputPass ? inputPass.value.trim() : "";

        const validUser = String(firebaseAuthCredentials.username || "haitham").trim();
        const validPassHash = firebaseAuthCredentials.passwordHash || await hashPassword("0000");
        const enteredHash = await hashPassword(enteredPass);

        if (enteredUser === validUser && enteredHash === validPassHash) {
            sessionStorage.setItem("isLoggedIn", "true");
            sessionStorage.setItem("sessionUsername", validUser);
            sessionStorage.setItem("sessionPassHash", validPassHash);
            sessionStorage.removeItem("sessionPassword"); // Clean up legacy plaintext password
            
            if (errorMsg) errorMsg.style.display = "none";
            
            // Hide modal with smooth transition
            loginOverlay.style.opacity = "0";
            setTimeout(() => {
                loginOverlay.style.display = "none";
                loginOverlay.style.opacity = "1";
            }, 350);

            showToast("تم تسجيل الدخول بنجاح 🔓", `مرحباً بك يا مستر ${escapeHTML(validUser)}!`, "success");
        } else {
            if (errorMsg) {
                errorMsg.textContent = "اسم المستخدم أو كلمة المرور غير صحيحة 🔴";
                errorMsg.style.display = "block";
            }
            showToast("فشل تسجيل الدخول 🔴", "يرجى التأكد من اسم المستخدم وكلمة المرور.", "error");
        }
    });

    // Handle Logout
    if (btnLogout) {
        btnLogout.addEventListener("click", async () => {
            const confirmLogout = await showConfirmModal(
                "هل أنت تأكد من تسجيل الخروج من النظام؟",
                "تأكيد الخروج",
                "خروج",
                "danger"
            );
            if (confirmLogout) {
                sessionStorage.removeItem("isLoggedIn");
                sessionStorage.removeItem("sessionPassHash");
                sessionStorage.removeItem("sessionUsername");
                sessionStorage.removeItem("sessionPassword");
                
                if (inputPass) inputPass.value = "";
                loginOverlay.style.display = "flex";
                showToast("تم تسجيل الخروج 🔒", "تم خروجك من نظام الأكاديمية بنجاح.", "info");
            }
        });
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        initExportExcelButton();
        initLoginSystem();
    });
} else {
    initExportExcelButton();
    initLoginSystem();
}
