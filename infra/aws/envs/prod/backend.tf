terraform {
  backend "s3" {
    bucket         = "wallet-portal-tfstate-prod"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "wallet-portal-tf-lock-prod"
    encrypt        = true
  }
}
