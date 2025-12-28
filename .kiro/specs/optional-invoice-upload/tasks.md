# Implementation Plan: Optional Invoice Upload

## Overview

本实现计划将"无发票报销"功能分解为一系列增量式的编码任务。每个任务都建立在前面任务的基础上，最终实现完整的功能。实现将使用Python和Flask框架，复用现有的数据模型和业务逻辑。

## Tasks

- [x] 1. 扩展数据模型和数据库架构
  - 在Invoice模型中添加record_type字段
  - 创建数据库迁移函数添加record_type列
  - 创建ManualRecordIDGenerator工具类生成唯一ID
  - _Requirements: 1.5, 5.1, 5.2, 11.1, 11.2_

- [ ]* 1.1 为数据模型扩展编写单元测试
  - 测试record_type字段的默认值
  - 测试ManualRecordIDGenerator生成的ID格式
  - 测试ID的唯一性
  - _Requirements: 5.1, 5.2_

- [ ]* 1.2 编写属性测试验证唯一ID生成
  - **Property 11: Unique Identifier Generation**
  - **Validates: Requirements 5.1**

- [ ]* 1.3 编写属性测试验证ID格式
  - **Property 12: Manual Record Identifier Format**
  - **Validates: Requirements 5.2**

- [x] 2. 实现手动记录创建API
  - 在user_api.py中添加POST /user/api/create-manual端点
  - 实现请求数据验证（必填字段、金额格式、日期格式）
  - 生成唯一记录ID
  - 创建Invoice对象并设置record_type为"manual"
  - 保存到数据库
  - 处理凭证图片上传（可选）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.5_

- [ ]* 2.1 编写属性测试验证手动记录创建
  - **Property 1: Manual Record Creation Without PDF**
  - **Validates: Requirements 1.5, 11.2**

- [ ]* 2.2 编写属性测试验证必填字段验证
  - **Property 2: Required Field Validation**
  - **Validates: Requirements 1.4, 4.4**

- [ ]* 2.3 编写属性测试验证金额验证
  - **Property 20: Amount Validation**
  - **Validates: Requirements 9.2**

- [ ]* 2.4 编写属性测试验证凭证格式验证
  - **Property 14: Voucher Image Format Validation**
  - **Validates: Requirements 6.2**

- [ ]* 2.5 编写属性测试验证无凭证创建
  - **Property 16: Manual Record Creation Without Vouchers**
  - **Validates: Requirements 6.5**

- [x] 3. 实现重复检测逻辑
  - 在SQLiteDataStore中添加check_manual_duplicate方法
  - 基于amount、invoice_date、item_name、uploaded_by检测重复
  - 在create-manual API中集成重复检测
  - 返回警告响应（允许用户继续）
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [ ]* 3.1 编写属性测试验证重复检测
  - **Property 25: Duplicate Detection**
  - **Validates: Requirements 12.1, 12.2**

- [ ]* 3.2 编写属性测试验证重复后继续创建
  - **Property 26: Duplicate Proceed**
  - **Validates: Requirements 12.4**

- [x] 4. Checkpoint - 确保后端API测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 修改发票列表API支持记录类型
  - 修改GET /user/api/invoices端点
  - 添加record_type查询参数支持过滤
  - 在响应中添加记录类型统计（invoice_count, manual_count, invoice_amount, manual_amount）
  - 在每个记录中包含record_type字段
  - _Requirements: 2.4, 7.1, 7.2, 7.3, 7.4, 11.5_

- [ ]* 5.1 编写属性测试验证记录类型过滤
  - **Property 5: Record Type Filtering**
  - **Validates: Requirements 2.4, 11.5**

- [ ]* 5.2 编写属性测试验证统计聚合
  - **Property 17: Statistics Aggregation**
  - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 6. 修改发票详情API支持手动记录
  - 修改GET /user/api/invoices/<invoice_number>端点
  - 确保返回record_type字段
  - 对于手动记录，确保pdf_data为NULL
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 11.3, 11.4_

- [ ]* 6.1 编写属性测试验证手动记录详情字段
  - **Property 6: Manual Record Detail Fields**
  - **Validates: Requirements 3.2**

- [ ]* 6.2 编写属性测试验证手动记录PDF字段
  - **Property 23: Manual Record PDF Field**
  - **Validates: Requirements 11.4**

- [ ]* 6.3 编写属性测试验证记录类型识别
  - **Property 24: Record Type Identification**
  - **Validates: Requirements 11.3**

- [x] 7. 实现手动记录编辑API
  - 在user_api.py中添加PUT /user/api/manual/<record_id>端点
  - 验证记录存在且为手动记录
  - 验证用户权限（只能编辑自己的记录）
  - 验证输入数据
  - 更新数据库记录
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ]* 7.1 编写属性测试验证手动记录更新
  - **Property 9: Manual Record Update**
  - **Validates: Requirements 4.3**

- [ ]* 7.2 编写属性测试验证发票记录编辑限制
  - **Property 10: Invoice Record Edit Restriction**
  - **Validates: Requirements 4.5**

- [x] 8. 修改删除API支持手动记录
  - 现有DELETE端点已支持删除手动记录（通过invoice_number）
  - 凭证文件删除已由voucher_service处理
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ]* 8.1 编写属性测试验证手动记录删除
  - **Property 22: Manual Record Deletion**
  - **Validates: Requirements 10.2**

- [x] 9. 修改导出功能支持手动记录
  - 修改export_service.py以包含record_type列
  - 在导出中显示"发票"或"手动输入"标识
  - 确保所有记录类型都被导出
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 5.4_

- [ ]* 9.1 编写属性测试验证导出完整性
  - **Property 18: Export Completeness**
  - **Validates: Requirements 8.1**

- [ ]* 9.2 编写属性测试验证导出记录类型列
  - **Property 19: Export Record Type Column**
  - **Validates: Requirements 8.2**

- [ ]* 9.3 编写属性测试验证导出标识符
  - **Property 13: Identifier Display in Export**
  - **Validates: Requirements 5.4, 8.3**

- [ ] 10. Checkpoint - 确保所有后端功能完整
  - 确保所有测试通过，如有问题请询问用户

- [x] 11. 创建前端上传模式选择器
  - 在upload.html中添加模式选择按钮（上传PDF vs 手动输入）
  - 添加CSS样式
  - 实现JavaScript切换逻辑
  - _Requirements: 1.1, 1.2_

- [ ]* 11.1 编写单元测试验证模式选择器存在
  - 测试两个模式按钮都存在
  - _Requirements: 1.1_

- [x] 12. 创建手动输入表单
  - 在upload.html中添加手动输入表单HTML
  - 包含所有必填字段（费用项目名称、金额、日期）
  - 包含可选字段（备注、报销人、凭证）
  - 添加表单样式
  - 实现日期选择器，默认为当前日期
  - _Requirements: 1.3, 9.1, 9.3, 9.4_

- [ ]* 12.1 编写单元测试验证表单字段存在
  - 测试所有必填字段存在
  - 测试日期选择器存在
  - _Requirements: 1.3, 9.3_

- [x] 13. 实现手动输入表单提交逻辑
  - 在user_app.js中添加表单提交处理
  - 实现客户端验证（必填字段、金额格式）
  - 调用POST /user/api/create-manual API
  - 处理成功和错误响应
  - 显示验证错误消息
  - 处理重复警告对话框
  - _Requirements: 1.4, 1.5, 9.2, 9.5, 12.1, 12.2, 12.3, 12.4_

- [ ]* 13.1 编写属性测试验证错误消息显示
  - **Property 21: Validation Error Messages**
  - **Validates: Requirements 9.5**

- [x] 14. 在发票列表中显示记录类型标识
  - 修改invoices.html和user_app.js
  - 为每条记录显示"有发票"或"无发票"徽章
  - 添加徽章样式
  - _Requirements: 2.1, 2.2, 2.3_

- [ ]* 14.1 编写属性测试验证记录类型视觉指示器
  - **Property 3: Record Type Visual Indicator**
  - **Validates: Requirements 2.1, 2.2, 3.3**

- [ ]* 14.2 编写属性测试验证发票记录视觉指示器
  - **Property 4: Invoice Record Visual Indicator**
  - **Validates: Requirements 2.3**

- [x] 15. 添加记录类型过滤功能
  - 在invoices.html中添加过滤按钮组（全部/有发票/手动输入）
  - 实现JavaScript过滤逻辑，支持状态和记录类型组合过滤
  - 客户端过滤，无需调用API
  - _Requirements: 2.4_

- [x] 16. 修改发票详情页面支持手动记录
  - 修改detail.html和user_app.js
  - 对于手动记录，显示"此记录无发票"提示
  - 对于手动记录，隐藏PDF下载按钮
  - 对于手动记录，显示编辑按钮
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1_

- [ ]* 16.1 编写属性测试验证PDF下载按钮排除
  - **Property 7: PDF Download Button Exclusion**
  - **Validates: Requirements 3.4**

- [ ]* 16.2 编写属性测试验证编辑按钮显示
  - **Property 8: Edit Button for Manual Records**
  - **Validates: Requirements 4.1**

- [x] 17. 实现手动记录编辑功能
  - 在detail.html中添加编辑模态框
  - 点击编辑按钮时显示表单并填充当前值
  - 实现保存逻辑，调用PUT /user/api/manual/<record_id> API
  - 处理成功和错误响应
  - _Requirements: 4.2, 4.3, 4.4_

- [x] 18. 更新统计显示
  - 修改invoices.html显示分类统计
  - 显示"有发票记录"和"无发票记录"的数量和金额
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 19. 实现凭证关联显示
  - 手动记录的凭证已通过现有voucher_service支持
  - 凭证上传和查看功能已在create-manual API中实现
  - _Requirements: 6.3, 6.4_

- [ ]* 19.1 编写属性测试验证凭证关联
  - **Property 15: Voucher Association**
  - **Validates: Requirements 6.3, 6.4**

- [x] 20. Final Checkpoint - 端到端测试
  - 测试完整的用户工作流：创建手动记录 → 查看列表 → 查看详情 → 编辑 → 删除
  - 测试混合场景：上传PDF发票 + 创建手动记录 → 查看列表 → 过滤 → 导出
  - 测试重复检测流程
  - 测试凭证上传和显示
  - 确保所有测试通过，如有问题请询问用户

- [x] 21. 更新用户端记录类型显示文案
  - 将所有"手动输入"文案改为"无票报销"
  - 更新invoices.html中的标签和按钮文本
  - 更新user_app.js中的显示逻辑
  - 更新upload.html中的模式选择器文本
  - _Requirements: 2.2, 7.3, 8.2_

- [x] 22. 更新导出服务的记录类型标识
  - 修改export_service.py中的记录类型列显示
  - 将"手动输入"改为"无票报销"
  - _Requirements: 8.2, 13.7_

- [x] 23. 在管理员后台添加记录类型显示
  - 修改index.html添加记录类型列
  - 为每条记录显示"有发票"或"无票报销"徽章
  - 添加徽章样式（复用用户端样式）
  - _Requirements: 13.1, 13.2, 13.3_

- [x] 24. 在管理员后台添加记录类型过滤功能
  - 在index.html中添加过滤按钮组（全部/有发票/无票报销）
  - 在app.js中实现过滤逻辑
  - 支持与其他过滤条件（状态、报销人）组合使用
  - _Requirements: 13.4, 13.5_

- [x] 25. 在管理员后台添加分类统计显示
  - 修改index.html显示分类统计
  - 显示"有发票记录"和"无票报销记录"的数量和金额
  - 修改API返回分类统计数据
  - _Requirements: 13.6_

- [x] 26. 修改管理员后台导出功能
  - 确保导出包含记录类型列
  - 记录类型显示为"发票"或"无票报销"
  - _Requirements: 13.7_

- [ ]* 26.1 编写属性测试验证管理员后台记录类型显示
  - **Property 27: Admin Record Type Visual Indicator**
  - **Validates: Requirements 13.1, 13.2, 13.3**

- [ ]* 26.2 编写属性测试验证管理员后台记录类型过滤
  - **Property 28: Admin Record Type Filtering**
  - **Validates: Requirements 13.4, 13.5**

- [ ]* 26.3 编写属性测试验证管理员后台统计聚合
  - **Property 29: Admin Statistics Aggregation**
  - **Validates: Requirements 13.6**

- [ ]* 26.4 编写属性测试验证管理员后台导出记录类型列
  - **Property 30: Admin Export Record Type Column**
  - **Validates: Requirements 13.7**

- [x] 27. Final Checkpoint - 验证所有更新
  - 测试用户端所有"无票报销"文案显示正确
  - 测试管理员后台记录类型过滤功能
  - 测试管理员后台分类统计显示
  - 测试导出文件中的记录类型列
  - 确保所有测试通过，如有问题请询问用户

## Notes

- 标记为`*`的任务是可选的测试任务，可以跳过以加快MVP开发
- 每个任务都引用了具体的需求以便追溯
- Checkpoint任务确保增量验证
- 属性测试验证通用正确性属性
- 单元测试验证特定示例和边界情况
