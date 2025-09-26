#!/bin/bash

# 邮件系统快速测试脚本
# 使用: ./test-email-quick.sh

echo "======================================"
echo "  Video2Text 邮件系统快速测试"
echo "======================================"
echo ""

# 默认配置
API_BASE="http://localhost:3000"
TEST_EMAIL="${1:-channelerH@gmail.com}"  # 可以通过参数传入测试邮箱

echo "测试配置:"
echo "  API地址: $API_BASE"
echo "  测试邮箱: $TEST_EMAIL"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. 检查服务器是否运行
echo "1. 检查开发服务器..."
if curl -s -o /dev/null -w "%{http_code}" $API_BASE | grep -q "200\|404"; then
    echo -e "${GREEN}✓ 服务器正在运行${NC}"
else
    echo -e "${RED}✗ 服务器未运行，请先运行: npm run dev${NC}"
    exit 1
fi
echo ""

# 2. 检查邮件系统状态
echo "2. 检查邮件系统状态..."
STATUS=$(curl -s $API_BASE/api/admin/email-status)
if echo "$STATUS" | grep -q "operational"; then
    echo -e "${GREEN}✓ 邮件系统正常${NC}"
    
    # 提取健康状态
    if echo "$STATUS" | grep -q "email_service"; then
        EMAIL_SERVICE=$(echo "$STATUS" | grep -o '"email_service":"[^"]*"' | cut -d'"' -f4)
        echo "  邮件服务: $EMAIL_SERVICE"
    fi
else
    echo -e "${RED}✗ 邮件系统状态异常${NC}"
    echo "响应: $STATUS"
fi
echo ""

# 3. 发送测试邮件
echo "3. 发送测试邮件到: $TEST_EMAIL"
echo "   模板: Day 3 激活邮件"

RESPONSE=$(curl -s -X POST $API_BASE/api/admin/send-test-email \
  -H "Content-Type: application/json" \
  -d "{
    \"to\": \"$TEST_EMAIL\",
    \"templateType\": \"day3_activation\",
    \"testData\": {
      \"userName\": \"Test User\",
      \"bonusMinutes\": 20,
      \"loginLink\": \"http://localhost:3000/signin\",
      \"feedbackLink\": \"http://localhost:3000/feedback\"
    }
  }")

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ 邮件发送成功！${NC}"
    echo "  请检查收件箱: $TEST_EMAIL"
    
    # 提取PS内容
    if echo "$RESPONSE" | grep -q "ps_generated"; then
        PS=$(echo "$RESPONSE" | grep -o '"ps_generated":"[^"]*"' | cut -d'"' -f4)
        echo "  生成的PS: $PS"
    fi
else
    echo -e "${RED}✗ 邮件发送失败${NC}"
    echo "响应: $RESPONSE"
    echo ""
    echo "可能的原因:"
    echo "  1. 未配置邮件服务 (GMAIL_APP_PASSWORD 或 RESEND_API_KEY)"
    echo "  2. Gmail应用密码错误"
    echo "  3. 网络问题"
fi
echo ""

# 4. 测试其他模板
echo "4. 是否测试其他邮件模板? (y/n)"
read -r ANSWER
if [ "$ANSWER" = "y" ]; then
    TEMPLATES=("day7_feedback" "paid_user_feedback" "win_back")
    
    for TEMPLATE in "${TEMPLATES[@]}"; do
        echo ""
        echo "发送模板: $TEMPLATE"
        
        RESPONSE=$(curl -s -X POST $API_BASE/api/admin/send-test-email \
          -H "Content-Type: application/json" \
          -d "{
            \"to\": \"$TEST_EMAIL\",
            \"templateType\": \"$TEMPLATE\",
            \"testData\": {
              \"userName\": \"Test User\",
              \"bonusMinutes\": 30
            }
          }")
        
        if echo "$RESPONSE" | grep -q '"success":true'; then
            echo -e "${GREEN}✓ $TEMPLATE 发送成功${NC}"
        else
            echo -e "${RED}✗ $TEMPLATE 发送失败${NC}"
        fi
    done
fi

echo ""
echo "======================================"
echo "测试完成！"
echo ""
echo "提示:"
echo "  - 如果邮件发送成功，请检查收件箱和垃圾邮件文件夹"
echo "  - 如果使用Gmail，确保已设置应用密码"
echo "  - 查看详细日志: npm run dev"
echo "======================================"