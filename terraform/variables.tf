variable "project_name" {
  description = "Nombre del proyecto para nombrar recursos"
  type        = string
  default     = "reto3-resilience"
}

variable "aws_region" {
  description = "Región de AWS para el despliegue"
  type        = string
  default     = "us-east-2"
}
