# AI Cost Control Infrastructure Module
# Codifies budget limits, monitoring, and feature flags for OpenAI spend management

terraform {
  required_version = ">= 1.5"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

# Variables
variable "namespace" {
  description = "Kubernetes namespace for AI cost control resources"
  type        = string
  default     = "production"
}

variable "openai_api_key" {
  description = "OpenAI API key (should be passed from secrets manager)"
  type        = string
  sensitive   = true
}

variable "monthly_budget_dollars" {
  description = "Monthly OpenAI budget in USD"
  type        = number
  default     = 100
  
  validation {
    condition     = var.monthly_budget_dollars > 0 && var.monthly_budget_dollars <= 1000
    error_message = "Monthly budget must be between $1 and $1000."
  }
}

variable "enable_ai_automation" {
  description = "Master switch for all AI automation features"
  type        = bool
  default     = false
}

variable "enable_sales_ai_optimization" {
  description = "Enable AI-powered sales automation (Week 1 rollout)"
  type        = bool
  default     = false
}

variable "enable_growth_ai_analytics" {
  description = "Enable AI-driven growth analytics (Week 2 rollout)"
  type        = bool
  default     = false
}

variable "enable_self_evolving_ai" {
  description = "Enable self-evolving system optimization (Week 3 rollout)"
  type        = bool
  default     = false
}

variable "openai_allowed_cidrs" {
  description = "List of CIDR blocks that are permitted to reach the OpenAI APIs"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "openai_blocked_cidrs" {
  description = "CIDR blocks that should be excluded from the OpenAI allow list (subset of allowed ranges)"
  type        = list(string)
  default     = []
}

variable "alert_email" {
  description = "Email address for AI cost alerts"
  type        = string
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for critical AI cost alerts"
  type        = string
  sensitive   = true
}

variable "cost_review_retry_attempts" {
  description = "Number of retry attempts for the daily cost review Slack notification"
  type        = number
  default     = 5

  validation {
    condition     = var.cost_review_retry_attempts > 0 && var.cost_review_retry_attempts <= 10
    error_message = "Retry attempts must be between 1 and 10."
  }
}

variable "cost_review_retry_delay_seconds" {
  description = "Delay in seconds between Slack notification retries"
  type        = number
  default     = 5

  validation {
    condition     = var.cost_review_retry_delay_seconds >= 1 && var.cost_review_retry_delay_seconds <= 60
    error_message = "Retry delay must be between 1 and 60 seconds."
  }
}

# Kubernetes Secret: OpenAI API Key
resource "kubernetes_secret" "openai_credentials" {
  metadata {
    name      = "openai-credentials"
    namespace = var.namespace
    
    labels = {
      "app.kubernetes.io/name"       = "ai-cost-controls"
      "app.kubernetes.io/managed-by" = "terraform"
    }
    
    annotations = {
      "budget-limit-dollars"   = tostring(var.monthly_budget_dollars)
      "created-by"             = "terraform"
      "cost-control-version"   = "1.0"
    }
  }

  data = {
    OPENAI_API_KEY = var.openai_api_key
  }

  type = "Opaque"
}

# Kubernetes Secret: Slack alerting credentials
resource "kubernetes_secret" "ai_alerting" {
  metadata {
    name      = "ai-cost-alerting"
    namespace = var.namespace

    labels = {
      "app.kubernetes.io/name"       = "ai-cost-controls"
      "app.kubernetes.io/managed-by" = "terraform"
    }

    annotations = {
      "created-by" = "terraform"
    }
  }

  data = {
    SLACK_WEBHOOK_URL = var.slack_webhook_url
  }

  type = "Opaque"
}

# Kubernetes Secret: AI Feature Flags
resource "kubernetes_secret" "ai_feature_flags" {
  metadata {
    name      = "ai-feature-flags"
    namespace = var.namespace
    
    labels = {
      "app.kubernetes.io/name"       = "ai-cost-controls"
      "app.kubernetes.io/managed-by" = "terraform"
    }
    
    annotations = {
      "rollout-stage"          = var.enable_self_evolving_ai ? "week-3" : (var.enable_growth_ai_analytics ? "week-2" : (var.enable_sales_ai_optimization ? "week-1" : "disabled"))
      "last-updated"           = timestamp()
    }
  }

  data = {
    ENABLE_AI_AUTOMATION           = tostring(var.enable_ai_automation)
    ENABLE_SALES_AI_OPTIMIZATION   = tostring(var.enable_sales_ai_optimization)
    ENABLE_GROWTH_AI_ANALYTICS     = tostring(var.enable_growth_ai_analytics)
    ENABLE_SELF_EVOLVING_AI        = tostring(var.enable_self_evolving_ai)
  }

  type = "Opaque"
}

# ConfigMap: AI Cost Control Configuration
resource "kubernetes_config_map" "ai_cost_config" {
  metadata {
    name      = "ai-cost-config"
    namespace = var.namespace
    
    labels = {
      "app.kubernetes.io/name"       = "ai-cost-controls"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  data = {
    MONTHLY_BUDGET_DOLLARS       = tostring(var.monthly_budget_dollars)
    SOFT_LIMIT_PERCENT           = "50"
    HARD_LIMIT_PERCENT           = "100"
    ALERT_EMAIL                  = var.alert_email
    DAILY_REVIEW_REQUIRED        = "true"
    COST_ESTIMATION_PER_CUSTOMER = "0.0831"  # $8.31/month per 100 customers
    
    # Model pricing (as of Nov 2024)
    GPT4O_MINI_INPUT_PRICE_PER_1M  = "0.150"
    GPT4O_MINI_OUTPUT_PRICE_PER_1M = "0.600"
  }
}

# Kubernetes NetworkPolicy: Restrict OpenAI API access
resource "kubernetes_network_policy" "openai_egress" {
  metadata {
    name      = "openai-egress-policy"
    namespace = var.namespace
  }

  spec {
    pod_selector {
      match_labels = {
        "ai-enabled" = "true"
      }
    }

    policy_types = ["Egress"]

    # Allow egress to OpenAI API
    egress {
      dynamic "to" {
        for_each = var.openai_allowed_cidrs
        content {
          ip_block {
            cidr   = to.value
            except = var.openai_blocked_cidrs
          }
        }
      }

      ports {
        protocol = "TCP"
        port     = "443"
      }
    }

    # Allow DNS resolution
    egress {
      to {
        namespace_selector {}
      }
      
      ports {
        protocol = "UDP"
        port     = "53"
      }
    }
  }
}

# Kubernetes CronJob: Daily AI Cost Review
resource "kubernetes_cron_job" "daily_cost_review" {
  metadata {
    name      = "ai-cost-daily-review"
    namespace = var.namespace
    
    labels = {
      "app.kubernetes.io/name"       = "ai-cost-controls"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  spec {
    schedule                      = "0 9 * * *"  # 9am daily
    concurrency_policy            = "Forbid"
    successful_jobs_history_limit = 7
    failed_jobs_history_limit     = 3

    job_template {
      metadata {
        name = "ai-cost-daily-review"
      }

      spec {
        template {
          metadata {
            labels = {
              app = "ai-cost-review"
            }
          }

          spec {
            restart_policy = "OnFailure"

            container {
              name  = "cost-reviewer"
              image = "curlimages/curl:8.4.0"

              command = ["/bin/sh", "-c"]
              args = [
                <<-EOT
                  set -euo pipefail
                  echo "Checking OpenAI usage..."

                  if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
                    echo "[warn] SLACK_WEBHOOK_URL not set; skipping notification"
                    exit 0
                  fi

                  MONTHLY_BUDGET_LABEL=${MONTHLY_BUDGET:-unknown}
                  RETRIES=${RETRY_ATTEMPTS:-5}
                  RETRY_DELAY=${RETRY_DELAY_SECONDS:-5}
                  PAYLOAD=$(printf '{"text":"Daily AI Cost Review: Budget $%s. Check Prometheus for openai_monthly_spend_dollars metric."}' "$MONTHLY_BUDGET_LABEL")

                  curl --fail --show-error --retry "$RETRIES" --retry-delay "$RETRY_DELAY" --retry-all-errors \
                    -X POST "$SLACK_WEBHOOK_URL" \
                    -H 'Content-Type: application/json' \
                    -d "$PAYLOAD"
                EOT
              ]

              env {
                name = "SLACK_WEBHOOK_URL"
                value_from {
                  secret_key_ref {
                    name = kubernetes_secret.ai_alerting.metadata[0].name
                    key  = "SLACK_WEBHOOK_URL"
                  }
                }
              }

              env {
                name = "MONTHLY_BUDGET"
                value_from {
                  config_map_key_ref {
                    name = kubernetes_config_map.ai_cost_config.metadata[0].name
                    key  = "MONTHLY_BUDGET_DOLLARS"
                  }
                }
              }

              env {
                name  = "RETRY_ATTEMPTS"
                value = tostring(var.cost_review_retry_attempts)
              }

              env {
                name  = "RETRY_DELAY_SECONDS"
                value = tostring(var.cost_review_retry_delay_seconds)
              }

              resources {
                requests = {
                  cpu    = "10m"
                  memory = "32Mi"
                }
                limits = {
                  cpu    = "50m"
                  memory = "64Mi"
                }
              }
            }
          }
        }
      }
    }
  }
}

# Outputs
output "openai_secret_name" {
  description = "Name of the Kubernetes secret containing OpenAI API key"
  value       = kubernetes_secret.openai_credentials.metadata[0].name
}

output "feature_flags_secret_name" {
  description = "Name of the Kubernetes secret containing AI feature flags"
  value       = kubernetes_secret.ai_feature_flags.metadata[0].name
}

output "cost_config_name" {
  description = "Name of the ConfigMap containing AI cost configuration"
  value       = kubernetes_config_map.ai_cost_config.metadata[0].name
}

output "monthly_budget_dollars" {
  description = "Configured monthly budget in USD"
  value       = var.monthly_budget_dollars
}

output "enabled_features" {
  description = "Currently enabled AI features"
  value = {
    ai_automation           = var.enable_ai_automation
    sales_ai_optimization   = var.enable_sales_ai_optimization
    growth_ai_analytics     = var.enable_growth_ai_analytics
    self_evolving_ai        = var.enable_self_evolving_ai
  }
}

output "rollout_stage" {
  description = "Current AI rollout stage"
  value = (
    var.enable_self_evolving_ai ? "week-3-complete" :
    var.enable_growth_ai_analytics ? "week-2-growth-enabled" :
    var.enable_sales_ai_optimization ? "week-1-sales-only" :
    "all-disabled"
  )
}
