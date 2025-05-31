const fs = require('fs');
const path = require('path');

class ProcessMonitor {
    constructor() {
        this.intervalId = null;
        this.fileStream = null;
        this.isMonitoring = false;
        // Variabel untuk menyimpan pembacaan CPU dan waktu terakhir
        this.lastCpuUsage = null;
        this.lastWallTime = null; // Menggunakan Date.now() untuk wall time
    }

    bytesToMB(bytes) {
        return (bytes / (1024 * 1024)).toFixed(2);
    }

    // Direvisi untuk menghitung penggunaan CPU per interval
    calculateIntervalCpuUsage() {
        const currentWallTime = Date.now(); // Waktu aktual saat ini dalam milidetik
        const currentUsage = process.cpuUsage(); // Penggunaan CPU kumulatif saat ini

        if (!this.lastCpuUsage || !this.lastWallTime) {
            // Untuk panggilan pertama, kita belum punya delta, jadi reset dan return 0
            this.lastCpuUsage = currentUsage;
            this.lastWallTime = currentWallTime;
            return '0.00'; // Atau bisa juga menunggu interval berikutnya
        }

        // Hitung selisih waktu CPU dalam mikrodetik
        const userTimeDiffMicros = currentUsage.user - this.lastCpuUsage.user;
        const systemTimeDiffMicros = currentUsage.system - this.lastCpuUsage.system;
        const totalCpuTimeForIntervalMicros = userTimeDiffMicros + systemTimeDiffMicros;

        // Hitung selisih waktu aktual dalam mikrodetik
        const elapsedTimeMillis = currentWallTime - this.lastWallTime;
        
        // Hindari pembagian dengan nol jika interval terlalu cepat atau waktu tidak berubah
        if (elapsedTimeMillis === 0) {
            // Update untuk interval berikutnya
            this.lastCpuUsage = currentUsage;
            this.lastWallTime = currentWallTime;
            return '0.00';
        }
        const elapsedTimeMicros = elapsedTimeMillis * 1000; // Konversi milidetik ke mikrodetik

        const cpuPercentage = (totalCpuTimeForIntervalMicros / elapsedTimeMicros) * 100;

        // Simpan pembacaan saat ini untuk perhitungan interval berikutnya
        this.lastCpuUsage = currentUsage;
        this.lastWallTime = currentWallTime;
        
        return cpuPercentage.toFixed(2);
    }

    getMemoryUsage() {
        const memoryUsage = process.memoryUsage();
        return {
            rss: this.bytesToMB(memoryUsage.rss),
            heapUsed: this.bytesToMB(memoryUsage.heapUsed),
            heapTotal: this.bytesToMB(memoryUsage.heapTotal)
        };
    }

    writeMetrics(metrics) {
        const csvLine = `${metrics.timestamp},${metrics.rss},${metrics.heapUsed},${metrics.heapTotal},${metrics.cpu}\n`;
        try {
            if (this.fileStream) { // Pastikan fileStream masih ada
                 this.fileStream.write(csvLine);
            }
        } catch (error) {
            console.error('Error writing to monitoring file:', error);
        }
    }

    startMonitoring(options = {}) {
        if (this.isMonitoring) {
            console.warn('Monitoring is already running');
            return;
        }

        const {
            logFilePath = `./monitoring_stats_${new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')}.csv`,
            intervalSeconds = 2
        } = options;

        try {
            const dir = path.dirname(logFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.fileStream = fs.createWriteStream(logFilePath, { flags: 'a' }); // Gunakan flag 'a' untuk append
            if (!fs.existsSync(logFilePath) || fs.statSync(logFilePath).size === 0) {
                 this.fileStream.write('Timestamp,RSS_MB,HeapUsed_MB,HeapTotal_MB,CPU_Percentage\n');
            }


            // Inisialisasi pembacaan CPU dan waktu awal untuk interval pertama
            this.lastCpuUsage = process.cpuUsage();
            this.lastWallTime = Date.now();
            this.isMonitoring = true;

            this.intervalId = setInterval(() => {
                // Pembacaan pertama setelah interval ini akan menghitung delta dari inisialisasi di atas
                const cpuUsageForInterval = this.calculateIntervalCpuUsage();
                
                const metrics = {
                    timestamp: new Date().toISOString(),
                    ...this.getMemoryUsage(),
                    cpu: cpuUsageForInterval
                };

                this.writeMetrics(metrics);
                // console.log('Metrics recorded:', metrics); // Optional logging ke konsol
            }, intervalSeconds * 1000);

            console.log(`Monitoring started. Logging to: ${logFilePath}`);
        } catch (error) {
            console.error('Error starting monitoring:', error);
            this.stopMonitoring(); // Pastikan membersihkan jika ada error saat start
            // throw error; // Anda bisa memilih untuk melempar error atau tidak
        }
    }

    stopMonitoring() {
        if (!this.isMonitoring) {
            // console.warn('Monitoring is not running'); // Bisa di-uncomment jika perlu
            return;
        }

        try {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }

            if (this.fileStream) {
                this.fileStream.end(() => {
                    // console.log('File stream closed.'); // Optional
                });
                this.fileStream = null;
            }

            this.isMonitoring = false;
            console.log('Monitoring stopped');
        } catch (error) {
            console.error('Error stopping monitoring:', error);
            // throw error; // Anda bisa memilih untuk melempar error atau tidak
        }
    }
}

module.exports = new ProcessMonitor();