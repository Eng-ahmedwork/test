(function () {
    function protectDevTools() {
        // 1. منع الزر الأيمن للماوس (Right-Click)
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        }, false);

        // 2. منع اختصارات الكيبورد الخاصة بأدوات المطورين
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            const isCtrl = e.ctrlKey || e.metaKey;

            // F12
            if (e.key === 'F12' || e.keyCode === 123) {
                e.preventDefault();
                return false;
            }

            // Ctrl + Shift + I / J / C (فتح الـ Inspector / Console)
            if (isCtrl && e.shiftKey && ['i', 'j', 'c'].includes(key)) {
                e.preventDefault();
                return false;
            }

            // Ctrl + U (عرض سورس الصفحة)
            if (isCtrl && key === 'u') {
                e.preventDefault();
                return false;
            }
        });

        // 3. حيلة الـ Debugger Loop (تجميد الصفحة إذا تم فتح الـ DevTools)
        setInterval(() => {
            const startTime = performance.now();
            
            // محاولة إيقاف التنفيذ برمجياً
            (function () {
                return false;
            })
            ["constructor"]("debugger")();

            const endTime = performance.now();
            
            // إذا كان وقت التنفيذ أطول من 100ms فهذا يعني أن أدوات المطورين مفتوحة
            if (endTime - startTime > 100) {
                // يمكنك إعادة توجيه المستخدم أو مسح محتوى الصفحة
                document.body.innerHTML = "<h1>عذراً، غير مسموح باستخدام أدوات المطورين!</h1>";
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', protectDevTools);
    } else {
        protectDevTools();
    }
})();