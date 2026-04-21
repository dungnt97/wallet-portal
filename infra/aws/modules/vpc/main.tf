# ─────────────────────────────────────────────────────────────────
# VPC — creates VPC, public + private subnets across 2 AZs,
#        IGW, single NAT gateway (cost optimised), route tables.
# ─────────────────────────────────────────────────────────────────

locals {
  # Derive sub-CIDRs deterministically from the root block.
  # /16 → split into /18 blocks; we need 4 subnets (2 public, 2 private).
  # cidrsubnet("10.10.0.0/16", 2, 0) = 10.10.0.0/18   → public-0
  # cidrsubnet("10.10.0.0/16", 2, 1) = 10.10.64.0/18  → public-1
  # cidrsubnet("10.10.0.0/16", 2, 2) = 10.10.128.0/18 → private-0
  # cidrsubnet("10.10.0.0/16", 2, 3) = 10.10.192.0/18 → private-1
  public_cidrs  = [for i in range(2) : cidrsubnet(var.cidr_block, 2, i)]
  private_cidrs = [for i in range(2) : cidrsubnet(var.cidr_block, 2, i + 2)]

  name_prefix = "wp-${var.env}"
}

# ── VPC ──────────────────────────────────────────────────────────
resource "aws_vpc" "this" {
  cidr_block           = var.cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${local.name_prefix}-vpc"
  }
}

# ── Internet Gateway ──────────────────────────────────────────────
resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${local.name_prefix}-igw"
  }
}

# ── Public subnets ────────────────────────────────────────────────
resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.name_prefix}-public-${count.index}"
    Tier = "public"
  }
}

# ── Private subnets ───────────────────────────────────────────────
resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name = "${local.name_prefix}-private-${count.index}"
    Tier = "private"
  }
}

# ── Elastic IP + NAT Gateway (single, cost-optimised) ─────────────
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${local.name_prefix}-nat-eip"
  }

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "${local.name_prefix}-nat"
  }

  depends_on = [aws_internet_gateway.this]
}

# ── Route Tables ──────────────────────────────────────────────────
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = {
    Name = "${local.name_prefix}-rt-public"
  }
}

resource "aws_route_table_association" "public" {
  count = 2

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }

  tags = {
    Name = "${local.name_prefix}-rt-private"
  }
}

resource "aws_route_table_association" "private" {
  count = 2

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ── Default NACL (allow all — fine-grained NACLs via security groups) ─
resource "aws_default_network_acl" "default" {
  default_network_acl_id = aws_vpc.this.default_network_acl_id

  ingress {
    protocol   = "-1"
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }

  egress {
    protocol   = "-1"
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }

  tags = {
    Name = "${local.name_prefix}-default-nacl"
  }
}

# ── Placeholder Security Group — referenced by data/compute modules ─
# Each module creates its own SG; this SG is the VPC default (locked down).
resource "aws_default_security_group" "default" {
  vpc_id = aws_vpc.this.id

  # No ingress/egress rules → all traffic denied by default.
  # Services must create explicit SGs.

  tags = {
    Name = "${local.name_prefix}-default-sg-locked"
  }
}
