"""
Function Call Tools
OpenAI Realtime APIで使用するFunction Callの定義と実装
"""

import asyncio
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class FunctionTool:
    """Function Callツールの基底クラス"""
    
    def __init__(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        execute: Callable
    ):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.execute_func = execute
    
    def to_dict(self) -> Dict[str, Any]:
        """OpenAI Realtime API用のtool定義に変換"""
        return {
            "type": "function",
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters
        }
    
    async def execute(self, arguments: Dict[str, Any]) -> Any:
        """Function Callを実行"""
        try:
            result = self.execute_func(arguments)
            # 非同期関数の場合はawait
            if asyncio.iscoroutine(result):
                result = await result
            return result
        except Exception as e:
            logger.error(f"Function {self.name} execution error: {e}")
            raise


# ============================================================
# サンプルFunction Callの実装
# ============================================================

def lookup_orders(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    注文情報を取得
    電話番号から注文履歴を検索
    """
    phone_number = args.get('phoneNumber', '')
    logger.info(f"注文検索: 電話番号 {phone_number}")
    
    # サンプルデータ
    return {
        "orders": [
            {
                "order_id": "SNP-20230914-001",
                "order_date": "2024-09-14T09:30:00Z",
                "delivered_date": "2024-09-16T14:00:00Z",
                "order_status": "delivered",
                "subtotal_usd": 409.98,
                "total_usd": 471.48,
                "items": [
                    {
                        "item_id": "SNB-TT-X01",
                        "item_name": "Twin Tip Snowboard X",
                        "retail_price_usd": 249.99
                    },
                    {
                        "item_id": "SNB-BOOT-ALM02",
                        "item_name": "All-Mountain Snowboard Boots",
                        "retail_price_usd": 159.99
                    }
                ]
            },
            {
                "order_id": "SNP-20230820-002",
                "order_date": "2023-08-20T10:15:00Z",
                "delivered_date": None,
                "order_status": "in_transit",
                "subtotal_usd": 339.97,
                "total_usd": 391.47,
                "items": [
                    {
                        "item_id": "SNB-JS-PRO",
                        "item_name": "Jib Series Pro Snowboard",
                        "retail_price_usd": 199.99
                    },
                    {
                        "item_id": "ACC-GOGGLE-UV",
                        "item_name": "UV Protection Goggles",
                        "retail_price_usd": 79.99
                    },
                    {
                        "item_id": "ACC-GLOVE-WP",
                        "item_name": "Waterproof Gloves",
                        "retail_price_usd": 59.99
                    }
                ]
            }
        ]
    }


def lookup_policy(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    返品ポリシーを取得
    地域とアイテムカテゴリーに基づいて返品ポリシーを検索
    """
    region = args.get('region', 'US')
    item_category = args.get('itemCategory', 'general')
    logger.info(f"ポリシー検索: 地域 {region}, カテゴリー {item_category}")
    
    return {
        "policy": """
At Snowy Peak Boards, we believe in transparent and customer-friendly policies to ensure you have a hassle-free experience. Below are our detailed guidelines:

1. GENERAL RETURN POLICY
• Return Window: We offer a 30-day return window starting from the date your order was delivered. 
• Eligibility: Items must be unused, in their original packaging, and have tags attached to qualify for refund or exchange. 
• Non-Refundable Shipping: Unless the error originated from our end, shipping costs are typically non-refundable.

2. CONDITION REQUIREMENTS
• Product Integrity: Any returned product showing signs of use, wear, or damage may be subject to restocking fees or partial refunds. 
• Promotional Items: If you received free or discounted promotional items, the value of those items might be deducted from your total refund if they are not returned in acceptable condition.
• Ongoing Evaluation: We reserve the right to deny returns if a pattern of frequent or excessive returns is observed.

3. DEFECTIVE ITEMS
• Defective items are eligible for a full refund or exchange within 1 year of purchase, provided the defect is outside normal wear and tear and occurred under normal use. 
• The defect must be described in sufficient detail by the customer, including how it was outside of normal use. Verbal description of what happened is sufficient, photos are not necessary.
• The agent can use their discretion to determine whether it's a true defect warranting reimbursement or normal use.

4. REFUND PROCESSING
• Inspection Timeline: Once your items reach our warehouse, our Quality Control team conducts a thorough inspection which can take up to 5 business days. 
• Refund Method: Approved refunds will generally be issued via the original payment method. In some cases, we may offer store credit or gift cards. 
• Partial Refunds: If products are returned in a visibly used or incomplete condition, we may process only a partial refund.

5. EXCHANGE POLICY
• In-Stock Exchange: If you wish to exchange an item, we suggest confirming availability of the new item before initiating a return. 
• Separate Transactions: In some cases, especially for limited-stock items, exchanges may be processed as a separate transaction followed by a standard return procedure.

6. ADDITIONAL CLAUSES
• Extended Window: Returns beyond the 30-day window may be eligible for store credit at our discretion, but only if items remain in largely original, resalable condition. 
• Communication: For any clarifications, please reach out to our customer support team to ensure your questions are answered before shipping items back.

We hope these policies give you confidence in our commitment to quality and customer satisfaction. Thank you for choosing Snowy Peak Boards!
"""
    }


def lookup_new_sales(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    セール情報を取得
    カテゴリーに基づいて現在のセール情報を検索
    """
    category = args.get('category', 'any')
    logger.info(f"セール情報検索: カテゴリー {category}")
    
    return {
        "promotions": [
            {
                "id": "WINTER2024",
                "title": "Winter Clearance Sale",
                "description": "Up to 40% off on all snowboards and boots",
                "discount_percentage": 40,
                "valid_until": "2024-12-31",
                "categories": ["snowboard", "boots"]
            },
            {
                "id": "BUNDLE2024",
                "title": "Complete Setup Bundle",
                "description": "Buy a snowboard and boots together, get 20% off accessories",
                "discount_percentage": 20,
                "valid_until": "2024-11-30",
                "categories": ["any"]
            }
        ]
    }


def authenticate_user_information(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    ユーザー認証
    電話番号、クレジットカード下4桁、SSN下4桁、生年月日で認証
    """
    phone_number = args.get('phone_number', '')
    last_4_cc = args.get('last_4_cc_digits', '')
    last_4_ssn = args.get('last_4_ssn_digits', '')
    dob = args.get('date_of_birth', '')
    
    logger.info(f"ユーザー認証: 電話番号 {phone_number}")
    
    # サンプルデータ - 実際にはデータベースで認証
    return {
        "authenticated": True,
        "user_id": "USER-12345",
        "name": "John Doe",
        "email": "john.doe@example.com",
        "phone": phone_number,
        "account_status": "active"
    }


def get_weather(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    天気情報を取得
    位置情報に基づいて現在の天気とスノーコンディションを返す
    """
    location = args.get('location', 'unknown')
    logger.info(f"天気情報取得: 場所 {location}")
    
    return {
        "location": location,
        "temperature": -5,
        "unit": "celsius",
        "conditions": "snowing",
        "snow_depth_cm": 120,
        "forecast": "Heavy snow expected, excellent powder conditions!",
        "last_updated": datetime.now().isoformat()
    }


# ============================================================
# Function Callツールのレジストリ
# ============================================================

# 利用可能なFunction Callツールを定義
AVAILABLE_TOOLS: Dict[str, FunctionTool] = {
    "lookupOrders": FunctionTool(
        name="lookupOrders",
        description="Retrieve detailed order information by using the user's phone number, including shipping status and item details.",
        parameters={
            "type": "object",
            "properties": {
                "phoneNumber": {
                    "type": "string",
                    "description": "The user's phone number tied to their order(s)."
                }
            },
            "required": ["phoneNumber"],
            "additionalProperties": False
        },
        execute=lookup_orders
    ),
    
    "lookupPolicy": FunctionTool(
        name="lookupPolicy",
        description="Retrieve return policy information based on region and item category.",
        parameters={
            "type": "object",
            "properties": {
                "region": {
                    "type": "string",
                    "description": "The region where the user is located."
                },
                "itemCategory": {
                    "type": "string",
                    "description": "The category of the item (e.g., shoes, accessories)."
                }
            },
            "required": ["region", "itemCategory"],
            "additionalProperties": False
        },
        execute=lookup_policy
    ),
    
    "lookupNewSales": FunctionTool(
        name="lookupNewSales",
        description="Checks for current promotions, discounts, or special deals.",
        parameters={
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["snowboard", "apparel", "boots", "accessories", "any"],
                    "description": "The product category to check for sales."
                }
            },
            "required": ["category"],
            "additionalProperties": False
        },
        execute=lookup_new_sales
    ),
    
    "authenticate_user_information": FunctionTool(
        name="authenticate_user_information",
        description="Look up a user's information to verify and authenticate the user.",
        parameters={
            "type": "object",
            "properties": {
                "phone_number": {
                    "type": "string",
                    "description": "The user's phone number."
                },
                "last_4_cc_digits": {
                    "type": "string",
                    "description": "Last 4 digits of credit card."
                },
                "last_4_ssn_digits": {
                    "type": "string",
                    "description": "Last 4 digits of SSN."
                },
                "date_of_birth": {
                    "type": "string",
                    "description": "Date of birth in YYYY-MM-DD format."
                }
            },
            "required": ["phone_number"],
            "additionalProperties": False
        },
        execute=authenticate_user_information
    ),
    
    "getWeather": FunctionTool(
        name="getWeather",
        description="Get current weather and snow conditions for a location.",
        parameters={
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "The location to get weather information for."
                }
            },
            "required": ["location"],
            "additionalProperties": False
        },
        execute=get_weather
    )
}


def get_tool_definitions() -> List[Dict[str, Any]]:
    """
    すべてのFunction Call定義をOpenAI Realtime API形式で返す
    """
    return [tool.to_dict() for tool in AVAILABLE_TOOLS.values()]


async def execute_function_call(function_name: str, arguments: Dict[str, Any]) -> Any:
    """
    Function Callを実行
    
    Args:
        function_name: 実行する関数名
        arguments: 関数の引数
    
    Returns:
        関数の実行結果
    """
    if function_name not in AVAILABLE_TOOLS:
        logger.error(f"Unknown function: {function_name}")
        return {"error": f"Unknown function: {function_name}"}
    
    tool = AVAILABLE_TOOLS[function_name]
    try:
        result = await tool.execute(arguments)
        logger.info(f"Function {function_name} executed successfully")
        return result
    except Exception as e:
        logger.error(f"Function {function_name} execution failed: {e}")
        return {"error": str(e)}
