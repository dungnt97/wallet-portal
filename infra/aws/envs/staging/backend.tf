terraform {
  backend "s3" {
    bucket         = "wallet-portal-tfstate-staging"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "wallet-portal-tf-lock-staging"
    encrypt        = true
  }
}
