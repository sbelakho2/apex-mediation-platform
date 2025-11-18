{{/*
Expand the name of the chart.
*/}}
{{- define "console.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "console.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "console.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "console.labels" -}}
helm.sh/chart: {{ include "console.chart" . }}
{{ include "console.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "console.selectorLabels" -}}
app.kubernetes.io/name: {{ include "console.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app: console
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "console.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "console.fullname" .) .Values.serviceAccount.name }}
{{- else }}
	{{- if not .Values.serviceAccount.name }}
		{{- fail "serviceAccount.name must be set when serviceAccount.create=false" }}
	{{- end }}
{{- .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Resolve the secret name used for envFrom mounts.
*/}}
{{- define "console.secretName" -}}
{{- if .Values.secrets.name }}
{{- .Values.secrets.name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-secrets" (include "console.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Resolve the config map name used for runtime NEXT_PUBLIC envs.
*/}}
{{- define "console.configMapName" -}}
{{- if .Values.config.name }}
{{- .Values.config.name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-config" (include "console.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Compute ingress host from explicit entry or defaults.
*/}}
{{- define "console.ingressHost" -}}
{{- $root := .root -}}
{{- $host := .host -}}
{{- if $host.host }}
{{- $host.host -}}
{{- else if $root.Values.ingress.defaultDomain }}
{{- printf "%s.%s" (default "console" $root.Values.ingress.hostnamePrefix) $root.Values.ingress.defaultDomain -}}
{{- else -}}
{{- printf "%s.%s" (default "console" $root.Values.ingress.hostnamePrefix) $root.Release.Name -}}
{{- end -}}
{{- end }}

{{/*
Determine the color selector for Services and validate overrides.
*/}}
{{- define "console.selectorColor" -}}
{{- $deploymentColor := .Values.deployment.color -}}
{{- $serviceColor := .Values.service.selector.color -}}
{{- if and $serviceColor (ne $serviceColor $deploymentColor) -}}
	{{- fail "service.selector.color must match deployment.color" -}}
{{- end -}}
{{- default $deploymentColor $serviceColor -}}
{{- end }}
