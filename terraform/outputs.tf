output "api_url" {
  description = "URL del endpoint de la API"
  value       = "${aws_api_gateway_stage.prod.invoke_url}/service-api"
}

output "lambda_function_name" {
  description = "Nombre de la función Lambda"
  value       = aws_lambda_function.service_function.function_name
}

output "dynamodb_table_name" {
  description = "Nombre de la tabla DynamoDB"
  value       = aws_dynamodb_table.state_table.name
}
