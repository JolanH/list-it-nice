package com.listitnice.app

import android.app.Application
import android.content.Context
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class ShoppingListViewModel(application: Application) : AndroidViewModel(application) {
    private val context = application.applicationContext
    private val sharedPrefs = context.getSharedPreferences("list_it_nice_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    // State holdings
    var activeList by mutableStateOf<ShoppingList?>(null)
        private set

    var recentLists by mutableStateOf<List<RecentList>>(emptyList())
        private set

    var serverUrl by mutableStateOf(
        sharedPrefs.getString("server_url", "https://ais-pre-xjv3hqwqwurtmwg4e2frfm-647222690376.europe-west2.run.app") ?: ""
    )
        private set

    var isSyncEnabled by mutableStateOf(
        sharedPrefs.getBoolean("is_sync_enabled", true)
    )
        private set

    var isSyncing by mutableStateOf(false)
        private set

    var error by mutableStateOf<String?>(null)

    init {
        loadRecentLists()
        val savedId = sharedPrefs.getString("sync_shopping_list_id", "") ?: ""
        if (savedId.isNotEmpty()) {
            loadList(savedId)
        } else {
            // Create a brand new default local list
            createNewListLocally("My Shopping List")
        }
    }

    // Server Configuration
    fun updateServerConfig(url: String, enabled: Boolean) {
        serverUrl = url.trim().removeSuffix("/")
        isSyncEnabled = enabled
        sharedPrefs.edit()
            .putString("server_url", serverUrl)
            .putBoolean("is_sync_enabled", isSyncEnabled)
            .apply()
        
        // If sync was re-enabled, push or pull current list
        if (isSyncEnabled && activeList != null) {
            syncWithServer()
        }
    }

    // Local Storage Loading/Saving helper
    private fun loadRecentLists() {
        val listsJson = sharedPrefs.getString("sync_recent_lists", null)
        recentLists = if (listsJson != null) {
            try {
                val type = object : TypeToken<List<RecentList>>() {}.type
                gson.fromJson(listsJson, type)
            } catch (e: Exception) {
                emptyList()
            }
        } else {
            emptyList()
        }
    }

    private fun saveRecentListsLocally() {
        val listsJson = gson.toJson(recentLists)
        sharedPrefs.edit().putString("sync_recent_lists", listsJson).apply()
    }

    private fun saveListLocally(list: ShoppingList) {
        val listJson = gson.toJson(list)
        sharedPrefs.edit()
            .putString("saved_list_${list.id}", listJson)
            .putString("sync_shopping_list_id", list.id)
            .apply()
            
        // Manage/Add to recent lists if not there
        val exists = recentLists.any { it.id == list.id }
        if (!exists) {
            recentLists = recentLists + RecentList(list.id, list.name)
            saveRecentListsLocally()
        } else {
            // Update name in recent lists if it changed
            recentLists = recentLists.map {
                if (it.id == list.id) RecentList(list.id, list.name) else it
            }
            saveRecentListsLocally()
        }
    }

    private fun loadListLocally(id: String): ShoppingList? {
        val listJson = sharedPrefs.getString("saved_list_${id.toUpperCase()}", null)
        return if (listJson != null) {
            try {
                gson.fromJson(listJson, ShoppingList::class.java)
            } catch (e: Exception) {
                null
            }
        } else {
            null
        }
    }

    // Dynamic ID generator matching server pattern (6-digit alphanumeric uppercase)
    private fun generateListId(): String {
        val chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        return (1..6).map { chars.random() }.joinToString("")
    }

    // App core flows
    fun createNewListLocally(name: String) {
        val cleanName = name.ifBlank { "My Shopping List" }
        val newId = generateListId()
        val newList = ShoppingList(
            id = newId,
            name = cleanName,
            items = emptyList(),
            updatedAt = System.currentTimeMillis()
        )
        activeList = newList
        saveListLocally(newList)
        
        if (isSyncEnabled) {
            syncWithServer()
        }
    }

    fun selectList(id: String) {
        loadList(id)
    }

    private fun loadList(id: String) {
        val upperId = id.toUpperCase()
        val local = loadListLocally(upperId)
        if (local != null) {
            activeList = local
        }
        
        if (isSyncEnabled) {
            viewModelScope.launch {
                isSyncing = true
                error = null
                try {
                    val remote = fetchRemoteList(upperId)
                    if (remote != null) {
                        // Merge or overwrite based on timestamp
                        if (local == null || remote.updatedAt >= local.updatedAt) {
                            activeList = remote
                            saveListLocally(remote)
                        } else {
                            // Push newer local list to server
                            pushRemoteList(local)
                        }
                    } else if (local != null) {
                        // Re-push list to server if missing there
                        pushRemoteList(local)
                    }
                } catch (e: Exception) {
                    error = "Failed to sync list: ${e.localizedMessage}"
                } finally {
                    isSyncing = false
                }
            }
        } else if (local == null) {
            // Fallback: create locally
            createNewListLocally("My Shopping List")
        }
    }

    fun updateListTitle(newTitle: String) {
        val current = activeList ?: return
        val updated = current.copy(
            name = newTitle,
            updatedAt = System.currentTimeMillis()
        )
        activeList = updated
        saveListLocally(updated)
        
        if (isSyncEnabled) {
            syncWithServer()
        }
    }

    // Items Manipulation
    fun addItem(name: String, quantity: String) {
        val current = activeList ?: return
        if (name.isBlank()) return
        
        val newItem = ShoppingItem(
            id = java.util.UUID.randomUUID().toString(),
            name = name.trim(),
            quantity = quantity.trim(),
            checked = false,
            createdAt = System.currentTimeMillis()
        )
        
        val updated = current.copy(
            items = current.items + newItem,
            updatedAt = System.currentTimeMillis()
        )
        activeList = updated
        saveListLocally(updated)
        
        if (isSyncEnabled) {
            syncWithServer()
        }
    }

    fun toggleItemChecked(itemId: String) {
        val current = activeList ?: return
        val updatedItems = current.items.map {
            if (it.id == itemId) it.copy(checked = !it.checked) else it
        }
        val updated = current.copy(
            items = updatedItems,
            updatedAt = System.currentTimeMillis()
        )
        activeList = updated
        saveListLocally(updated)
        
        if (isSyncEnabled) {
            syncWithServer()
        }
    }

    fun deleteItem(itemId: String) {
        val current = activeList ?: return
        val updatedItems = current.items.filter { it.id != itemId }
        val updated = current.copy(
            items = updatedItems,
            updatedAt = System.currentTimeMillis()
        )
        activeList = updated
        saveListLocally(updated)
        
        if (isSyncEnabled) {
            syncWithServer()
        }
    }

    fun deleteActiveList() {
        val current = activeList ?: return
        val targetId = current.id
        
        // Remove locally
        sharedPrefs.edit().remove("saved_list_$targetId").apply()
        recentLists = recentLists.filter { it.id != targetId }
        saveRecentListsLocally()
        
        val fallback = recentLists.firstOrNull()
        if (fallback != null) {
            loadList(fallback.id)
        } else {
            createNewListLocally("My Shopping List")
        }

        if (isSyncEnabled) {
            viewModelScope.launch(Dispatchers.IO) {
                try {
                    val request = Request.Builder()
                        .url("$serverUrl/api/lists/$targetId")
                        .delete()
                        .build()
                    client.newCall(request).execute().use { }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    fun duplicateActiveList(newName: String) {
        val current = activeList ?: return
        viewModelScope.launch {
            isSyncing = true
            error = null
            try {
                if (isSyncEnabled) {
                    val body = gson.toJson(mapOf("newName" to newName)).toRequestBody(jsonMediaType)
                    val request = Request.Builder()
                        .url("$serverUrl/api/lists/${current.id}/duplicate")
                        .post(body)
                        .build()
                    
                    val responseList = withContext(Dispatchers.IO) {
                        client.newCall(request).execute().use { response ->
                            if (response.isSuccessful) {
                                gson.fromJson(response.body?.string(), ShoppingList::class.java)
                            } else {
                                null
                            }
                        }
                    }
                    if (responseList != null) {
                        activeList = responseList
                        saveListLocally(responseList)
                    } else {
                        duplicateLocally(newName)
                    }
                } else {
                    duplicateLocally(newName)
                }
            } catch (e: Exception) {
                duplicateLocally(newName)
                error = "Duplicated offline. Cloud sync error: ${e.localizedMessage}"
            } finally {
                isSyncing = false
            }
        }
    }

    private fun duplicateLocally(newName: String) {
        val current = activeList ?: return
        val newId = generateListId()
        val copiedItems = current.items.map {
            it.copy(
                id = java.util.UUID.randomUUID().toString(),
                createdAt = System.currentTimeMillis()
            )
        }
        val duplicated = ShoppingList(
            id = newId,
            name = newName.ifBlank { "${current.name} (Copy)" },
            items = copiedItems,
            updatedAt = System.currentTimeMillis()
        )
        activeList = duplicated
        saveListLocally(duplicated)
    }

    fun importListFromPayload(payload: String, overwriteMode: Boolean) {
        try {
            val imported = gson.fromJson(payload, ShoppingList::class.java)
            val current = activeList
            
            if (overwriteMode || current == null) {
                activeList = imported
                saveListLocally(imported)
                if (isSyncEnabled) {
                    viewModelScope.launch(Dispatchers.IO) {
                        pushListSynchronous(imported)
                    }
                }
            } else {
                // Merge Mode: merge items by name
                val mergedItems = current.items.toMutableList()
                for (impItem in imported.items) {
                    val existIndex = mergedItems.indexOfFirst { it.name.equals(impItem.name, ignoreCase = true) }
                    if (existIndex != -1) {
                        mergedItems[existIndex] = mergedItems[existIndex].copy(
                            quantity = impItem.quantity.ifBlank { mergedItems[existIndex].quantity }
                        )
                    } else {
                        mergedItems.add(impItem.copy(id = java.util.UUID.randomUUID().toString()))
                    }
                }
                val mergedList = current.copy(
                    items = mergedItems,
                    updatedAt = System.currentTimeMillis()
                )
                activeList = mergedList
                saveListLocally(mergedList)
                if (isSyncEnabled) {
                    viewModelScope.launch(Dispatchers.IO) {
                        pushListSynchronous(mergedList)
                    }
                }
            }
        } catch (e: Exception) {
            error = "Failed to parse imported list: ${e.localizedMessage}"
        }
    }

    // Voice parsing with Gemini-backend proxy
    fun parseVoiceItems(transcript: String, onComplete: (List<VoiceParseItem>) -> Unit) {
        if (transcript.isBlank()) return
        viewModelScope.launch {
            isSyncing = true
            try {
                val body = gson.toJson(VoiceParseRequest(transcript)).toRequestBody(jsonMediaType)
                val request = Request.Builder()
                    .url("$serverUrl/api/parse-voice-items")
                    .post(body)
                    .build()
                
                val parsedItems = withContext(Dispatchers.IO) {
                    client.newCall(request).execute().use { response ->
                        if (response.isSuccessful) {
                            val resObj = gson.fromJson(response.body?.string(), VoiceParseResponse::class.java)
                            resObj.items
                        } else {
                            emptyList()
                        }
                    }
                }
                
                if (parsedItems.isNotEmpty()) {
                    onComplete(parsedItems)
                } else {
                    error = "No shopping items recognized."
                }
            } catch (e: Exception) {
                error = "Voice AI Error: ${e.localizedMessage}"
            } finally {
                isSyncing = false
            }
        }
    }

    // Force synchronization manual trigger
    fun forceSync() {
        if (isSyncEnabled) {
            syncWithServer()
        }
    }

    private suspend fun fetchRemoteList(id: String): ShoppingList? = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$serverUrl/api/lists/$id")
                .get()
                .build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    gson.fromJson(response.body?.string(), ShoppingList::class.java)
                } else {
                    null
                }
            }
        } catch (e: Exception) {
            null
        }
    }

    private suspend fun pushRemoteList(list: ShoppingList) = withContext(Dispatchers.IO) {
        pushListSynchronous(list)
    }

    private fun pushListSynchronous(list: ShoppingList) {
        try {
            val json = gson.toJson(list)
            val body = json.toRequestBody(jsonMediaType)
            val request = Request.Builder()
                .url("$serverUrl/api/lists/${list.id}")
                .put(body)
                .build()
            client.newCall(request).execute().use { }
        } catch (e: java.io.IOException) {
            e.printStackTrace()
        }
    }
}
