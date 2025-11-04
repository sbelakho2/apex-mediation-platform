#!/bin/bash

# S3 Accounting Bucket Setup
# Creates S3 bucket with Object Lock for 7-year document retention (Estonian Accounting Act compliance)

set -e

BUCKET_NAME="${S3_ACCOUNTING_BUCKET:-rivalapexmediation-accounting}"
AWS_REGION="${AWS_REGION:-eu-north-1}"  # Stockholm (closest to Estonia)

echo "=================================================="
echo "Setting up S3 Accounting Bucket"
echo "=================================================="
echo ""
echo "Bucket: $BUCKET_NAME"
echo "Region: $AWS_REGION"
echo ""

# Check if bucket exists
if aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
  echo "⚠️  Bucket already exists: $BUCKET_NAME"
  read -p "Do you want to update its configuration? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
  fi
  BUCKET_EXISTS=true
else
  BUCKET_EXISTS=false
fi

if [ "$BUCKET_EXISTS" = false ]; then
  echo "📦 Creating bucket with Object Lock enabled..."
  aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$AWS_REGION" \
    --create-bucket-configuration LocationConstraint="$AWS_REGION" \
    --object-lock-enabled-for-bucket

  echo "✅ Bucket created"
fi

echo "🔒 Enabling versioning (required for Object Lock)..."
aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled

echo "🔐 Configuring Object Lock default retention (7 years)..."
aws s3api put-object-lock-configuration \
  --bucket "$BUCKET_NAME" \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": {
      "DefaultRetention": {
        "Mode": "COMPLIANCE",
        "Years": 7
      }
    }
  }'

echo "🔒 Configuring encryption..."
aws s3api put-bucket-encryption \
  --bucket "$BUCKET_NAME" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      },
      "BucketKeyEnabled": true
    }]
  }'

echo "🚫 Blocking public access..."
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    BlockPublicAcls=true,\
IgnorePublicAcls=true,\
BlockPublicPolicy=true,\
RestrictPublicBuckets=true

echo "📋 Configuring lifecycle policy..."
cat > /tmp/lifecycle-policy.json <<EOF
{
  "Rules": [
    {
      "Id": "InvoiceRetention",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "invoices/"
      },
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 90
      }
    },
    {
      "Id": "VATReportRetention",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "vat-reports/"
      },
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 90
      }
    },
    {
      "Id": "ReceiptRetention",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "receipts/"
      },
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 90
      }
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET_NAME" \
  --lifecycle-configuration file:///tmp/lifecycle-policy.json

rm /tmp/lifecycle-policy.json

echo "🏷️  Adding tags..."
aws s3api put-bucket-tagging \
  --bucket "$BUCKET_NAME" \
  --tagging 'TagSet=[
    {Key=Project,Value=RivalApexMediation},
    {Key=Purpose,Value=Accounting},
    {Key=Compliance,Value=EstonianAccountingAct},
    {Key=Retention,Value=7Years}
  ]'

echo ""
echo "✅ S3 bucket configured successfully!"
echo ""
echo "Bucket details:"
echo "  Name: $BUCKET_NAME"
echo "  Region: $AWS_REGION"
echo "  Versioning: Enabled"
echo "  Object Lock: COMPLIANCE mode, 7 years"
echo "  Encryption: AES256"
echo "  Public Access: Blocked"
echo ""
echo "Folder structure:"
echo "  invoices/YYYY/INV-XXXXXX.pdf"
echo "  invoices/YYYY/INV-XXXXXX.xml"
echo "  vat-reports/YYYY/QX-VAT-Report.pdf"
echo "  receipts/YYYY/MM/receipt-XXX.pdf"
echo "  annual-reports/YYYY/annual-report.xbrl"
echo ""
echo "⚠️  IMPORTANT: Objects in COMPLIANCE mode cannot be deleted"
echo "    even by root account until retention period expires!"
echo ""
echo "Add to .env:"
echo "  S3_ACCOUNTING_BUCKET=$BUCKET_NAME"
echo "  AWS_REGION=$AWS_REGION"
echo ""
