package com.listitnice.app

data class ShoppingItem(
    val id: String,
    val name: String,
    val quantity: String = "",
    val checked: Boolean = false,
    val createdAt: Long = System.currentTimeMillis()
)

data class ShoppingList(
    val id: String,
    val name: String,
    val items: List<ShoppingItem> = emptyList(),
    val updatedAt: Long = System.currentTimeMillis()
)

data class RecentList(
    val id: String,
    val name: String
)

data class VoiceParseRequest(
    val text: String
)

data class VoiceParseItem(
    val name: String,
    val quantity: String = ""
)

data class VoiceParseResponse(
    val items: List<VoiceParseItem> = emptyList()
)
