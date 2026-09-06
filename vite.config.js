import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import viteCompression from 'vite-plugin-compression' // ضغط Gzip/Brotli
import { visualizer } from 'rollup-plugin-visualizer' // لتحليل حجم الباندل

export default defineConfig({
    plugins: [
        react(),
        viteCompression({
            algorithm: 'brotliCompress', // الأفضل (Brotli)
            ext: '.br',
            deleteOriginFile: false, // يخلي الملف الأصلي موجود كمان
        }),
        viteCompression({
            algorithm: 'gzip',
            ext: '.gz',
            deleteOriginFile: false,
        }),
        visualizer({ open: false, filename: 'stats.html' })
    ],
    base: '/',
    build: {
        target: 'esnext',
        minify: 'esbuild', // ضغط JS & CSS (مدمج مع Vite)
        cssCodeSplit: true, // يعمل Code Splitting للـ CSS
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ['react', 'react-dom'], // يفصل React في ملف لوحده
                    vendor: ['swiper', 'lucide-react'], // يفصل المكتبات التقيلة
                },
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
        extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    },
})
