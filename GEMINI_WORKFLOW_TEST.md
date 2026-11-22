# QUY TRÌNH PHÁT TRIỂN VÀ VẬN HÀNH CODE – GEMINI CODING AGENT
## DỰ ÁN: FOODRADAR HCMC

Tài liệu này xác lập quy trình làm việc chuẩn mực và khép kín của Gemini Coding Agent khi tham gia bảo trì, phát triển và nâng cấp hệ thống **FoodRadar HCMC**.

---

## I. NGUYÊN TẮC CỐT LÕI (CORE PRINCIPLES)

1. **Bảo toàn hệ thống đang hoạt động:**
   - Tuyệt đối không tái cấu trúc (refactor) hoặc viết lại toàn bộ mã nguồn khi chưa có yêu cầu cụ thể.
   - Thay đổi tối thiểu (minimal change), giải quyết đúng trọng tâm vấn đề được giao.
   - Không tự ý sửa schema hoặc dữ liệu của `restaurants.json`.
   - Giữ nguyên cấu trúc theme, các CSS variables và quy ước đặt tên class trạng thái (`open`, `closed`, `unknown`).

2. **An toàn bảo mật & Git:**
   - Không đưa API key, access token, secret hoặc dữ liệu nhạy cảm lên kho mã nguồn GitHub.
   - Không push trực tiếp lên nhánh `main`.
   - Không tự ý merge Pull Request hoặc xóa nhánh `main`.
   - Mọi thao tác merge vào nhánh `main` phải chờ kiểm tra và phê duyệt từ Người dùng và ChatGPT.

---

## II. QUY TRÌNH 10 BƯỚC BẮT BUỘC (MANDATORY 10-STEP WORKFLOW)

Mỗi nhiệm vụ kỹ thuật (fix bug, thêm tính năng, chỉnh sửa giao diện) phải tuân thủ nghiêm ngặt 10 bước sau:

```
[B1: Kiểm tra Git] ──> [B2: Đồng bộ main] ──> [B3: Tạo nhánh riêng]
        │
        ▼
[B4: Đọc & Khoanh vùng] ──> [B5: Sửa code tối thiểu] ──> [B6: Kiểm thử & Build]
        │
        ▼
[B7: Stage chính xác file] ──> [B8: Commit rõ ràng] ──> [B9: Push lên nhánh riêng]
        │
        ▼
[B10: Tạo Draft PR & Báo cáo]
```

### Bước 1: Kiểm tra trạng thái Git
- Chạy `git status` để xác định trạng thái cây thư mục làm việc, đảm bảo không có file rác hoặc thay đổi tồn đọng.

### Bước 2: Cập nhật mã nguồn mới nhất
- Kiểm tra nhánh `main` và đồng bộ với remote mới nhất trước khi bắt đầu nhiệm vụ mới.

### Bước 3: Tạo nhánh làm việc riêng
- Tạo và chuyển sang nhánh riêng với tiền tố `gemini/` và tên mô tả ngắn gọn, dễ hiểu:
  ```bash
  git checkout -b gemini/<ten-nhiem-vu>
  ```
  *(Ví dụ: `gemini/fix-map-popup`, `gemini/add-weather-cache`, `gemini/workflow-test-doc`)*

### Bước 4: Khảo sát mã nguồn hiện hữu
- Đọc trực tiếp các file liên quan trước khi sửa.
- Xác định phạm vi ảnh hưởng (dependency tree giữa JSX, CSS, Services và JSON).

### Bước 5: Thực hiện chỉnh sửa
- Áp dụng nguyên tắc thay đổi tối thiểu, chỉ tác động vào đúng các dòng mã hoặc component cần sửa.

### Bước 6: Kiểm tra và kiểm thử thực tế
- Kiểm tra cú pháp (ESLint): `npm run lint`
- Kiểm tra đóng gói (Vite Build): `npm run build`
- Kiểm tra `git diff` để đảm bảo không có file ngoài phạm vi bị thay đổi ngẫu nhiên.
- Chỉ báo cáo các kết quả kiểm tra đã thực sự chạy trong môi trường console.

### Bước 7: Stage file chính xác
- Chỉ stage đúng các file thuộc phạm vi nhiệm vụ:
  ```bash
  git add <file-duoc-chi-dinh>
  ```
- Tránh dùng lệnh `git add .` khi có file tạm hoặc thay đổi không liên quan.

### Bước 8: Tạo Commit chuẩn mực
- Viết commit message bằng tiếng Anh hoặc tiếng Việt rõ ràng, phản ánh chính xác nội dung thay đổi:
  ```bash
  git commit -m "feat(docs): add gemini autonomous workflow test documentation"
  ```

### Bước 9: Push lên nhánh làm việc riêng
- Đẩy nhánh lên GitHub remote:
  ```bash
  git push -u origin gemini/<ten-nhiem-vu>
  ```

### Bước 10: Khởi tạo Pull Request (Draft PR)
- Tạo Draft Pull Request hướng về nhánh `main` trên GitHub để chờ Người dùng và ChatGPT review trước khi merge.

---

## III. CẤU TRÚC NỘI DUNG PULL REQUEST

Mỗi Pull Request được tạo phải bao gồm đầy đủ 7 mục tiêu chuẩn:
1. **Mục tiêu thay đổi (Objective):** Tóm tắt vấn đề cần giải quyết hoặc tính năng mới.
2. **Danh sách file đã sửa (Changed Files):** Liệt kê chi tiết từng file được thêm mới hoặc chỉnh sửa.
3. **Giải thích chi tiết thay đổi (Detailed Changes):** Mô tả cụ thể logic được sửa tại từng file.
4. **Chức năng có thể bị ảnh hưởng (Potential Impact):** Đánh giá các module liên đới (Bản đồ, Bộ lọc, Popup, PWA...).
5. **Kết quả kiểm thử & Build (Test & Build Results):** Ghi rõ trạng thái build (`npm run build`), lint và kiểm tra thủ công.
6. **Điểm chưa kiểm tra được (Limitations / Untested Items):** Các điều kiện môi trường chưa thể test hết (nếu có).
7. **Thông tin Commit & Branch (Git Metadata):** Commit ID SHA, tên branch và đường dẫn PR.

---

## IV. TỔNG QUAN HỆ THỐNG HIỆN TẠI (SYSTEM REFERENCE)

- **Frontend Framework:** React 19 + Vite 8
- **Bản đồ:** Leaflet 1.9.4, Geoapify Tile Layer, Leaflet.heat 1.0.1
- **Dữ liệu quán ăn:** `restaurants.json` (546 bản ghi) tại thư mục gốc, được phục vụ qua custom Vite plugin.
- **PWA & Offline:** `sw.js` (Cache strategy: Network-First cho HTML & JSON; Cache-First cho asset tĩnh).
- **Môi trường Deploy:** GitHub Actions (`.github/workflows/deploy.yml`) $\rightarrow$ GitHub Pages.
