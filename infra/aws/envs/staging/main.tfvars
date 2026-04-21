env                = "staging"
aws_region         = "us-east-1"
vpc_cidr           = "10.10.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"]
project            = "wallet-portal"

# Data tier
db_instance_class = "db.t4g.micro"
db_multi_az       = false
redis_node_type   = "cache.t4g.micro"

# Edge — replace with real domain before apply
domain_name = "staging.wallet-portal.example.com"
