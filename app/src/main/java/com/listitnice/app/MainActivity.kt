package com.listitnice.app

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognizerIntent
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.gson.Gson
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import java.net.URLDecoder
import java.net.URLEncoder

class MainActivity : ComponentActivity() {

    private val pendingImportPayload = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState);

        // Check deep-link data on cold start
        intent?.let { handleIncomingIntent(it) }

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = Color(0xFF9333EA),
                    onPrimary = Color.White,
                    background = Color(0xFF18181B),
                    surface = Color(0xFF27272A),
                    onBackground = Color.White,
                    onSurface = Color.White
                )
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val viewModel: ShoppingListViewModel = viewModel()

                    // Monitor deep link check
                    LaunchedEffect(pendingImportPayload.value) {
                        pendingImportPayload.value?.let { payload ->
                            // Payload is loaded
                        }
                    }

                    ShoppingListAppScreen(
                        viewModel = viewModel,
                        pendingPayload = pendingImportPayload,
                        onScanTrigger = { triggerSpeechRecognizer() }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIncomingIntent(intent)
    }

    private fun handleIncomingIntent(intent: Intent) {
        val data = intent.data ?: return
        try {
            val importPayload = data.getQueryParameter("data") ?: data.getQueryParameter("import")
            if (!importPayload.isNullOrEmpty()) {
                val decoded = URLDecoder.decode(importPayload, "UTF-8")
                pendingImportPayload.value = decoded
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // Standard Android Activity Speech recognizer contract launcher
    private var speechResultCallback: ((String) -> Unit)? = null

    private val speechLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val results = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            val spokenText = results?.firstOrNull() ?: ""
            if (spokenText.isNotBlank()) {
                speechResultCallback?.invoke(spokenText)
            }
        }
    }

    private fun triggerSpeechRecognizer() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Say items (e.g., '6 bananas, milk, and cereal')")
        }
        try {
            speechLauncher.launch(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "Speech recognition not supported on this device.", Toast.LENGTH_SHORT).show()
        }
    }

    fun setVoiceCallback(callback: (String) -> Unit) {
        speechResultCallback = callback
    }
}

@Composable
fun ShoppingListAppScreen(
    viewModel: ShoppingListViewModel,
    pendingPayload: MutableState<String?>,
    onScanTrigger: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var showSyncConfigDialog by remember { mutableStateOf(false) }
    var showShareQrDialog by remember { mutableStateOf(false) }
    var showCameraScannerDialog by remember { mutableStateOf(false) }
    var showDuplicationDialog by remember { mutableStateOf(false) }
    var showEditTitleDialog by remember { mutableStateOf(false) }
    var showJoinCodeDialog by remember { mutableStateOf(false) }
    var showRecentListsDialog by remember { mutableStateOf(false) }

    var inputItemName by remember { mutableStateOf("") }
    var inputItemQty by remember { mutableStateOf("") }
    var editedTitle by remember { mutableStateOf("") }
    var duplicateTitle by remember { mutableStateOf("") }
    var customCodeInput by remember { mutableStateOf("") }

    val activeList = viewModel.activeList

    // Connect Speach Engine callback to ViewModel parsing
    val activity = context as? MainActivity
    activity?.setVoiceCallback { transcript ->
        Toast.makeText(context, "Processing voice: \"$transcript\"", Toast.LENGTH_SHORT).show()
        viewModel.parseVoiceItems(transcript) { extractedItems ->
            extractedItems.forEach { parsed ->
                viewModel.addItem(parsed.name, parsed.quantity)
            }
            Toast.makeText(context, "Successfully added ${extractedItems.size} items using AI!", Toast.LENGTH_LONG).show()
        }
    }

    // Monitor internal ViewModel error states
    LaunchedEffect(viewModel.error) {
        viewModel.error?.let { err ->
            Toast.makeText(context, err, Toast.LENGTH_LONG).show()
            viewModel.error = null
        }
    }

    // Merge or Overwrite Dialog for deep links and scanner imports
    pendingPayload.value?.let { rawPayload ->
        AlertDialog(
            onDismissRequest = { pendingPayload.value = null },
            title = { Text("Import Shopping List") },
            text = {
                Text("This shared link contains shopping list details. Would you like to merge the items into your current active list, or overwrite it completely?")
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.importListFromPayload(rawPayload, overwriteMode = false)
                        pendingPayload.value = null
                        Toast.makeText(context, "Items merged successfully!", Toast.LENGTH_SHORT).show()
                    }
                ) {
                    Text("Merge Items")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        viewModel.importListFromPayload(rawPayload, overwriteMode = true)
                        pendingPayload.value = null
                        Toast.makeText(context, "List overwritten successfully!", Toast.LENGTH_SHORT).show()
                    }
                ) {
                    Text("Overwrite Completely")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF18181B))
                        .padding(horizontal = 12.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { showRecentListsDialog = true }) {
                        Icon(Icons.Default.Menu, contentDescription = "Manage Lists", tint = Color.White)
                    }

                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clickable {
                                editedTitle = activeList?.name ?: ""
                                showEditTitleDialog = true
                            }
                            .padding(horizontal = 8.dp)
                    ) {
                        Text(
                            text = activeList?.name ?: "Shopping List",
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            ),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "Code: ${activeList?.id ?: "..."}",
                                style = MaterialTheme.typography.bodySmall.copy(
                                    color = Color(0xFFA1A1AA),
                                    fontFamily = FontFamily.Monospace
                                )
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Icon(
                                imageVector = Icons.Default.Copy,
                                contentDescription = "Copy code",
                                tint = Color(0xFFA1A1AA),
                                modifier = Modifier
                                    .size(12.dp)
                                    .clickable {
                                        activeList?.id?.let { code ->
                                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                            val clip = ClipData.newPlainText("List Sync Code", code)
                                            clipboard.setPrimaryClip(clip)
                                            Toast.makeText(context, "List code copied!", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                            )
                        }
                    }

                    // Share, Duplicate & settings
                    IconButton(onClick = { showShareQrDialog = true }) {
                        Icon(Icons.Default.Share, contentDescription = "Share QR", tint = Color(0xFFC084FC))
                    }
                    IconButton(onClick = {
                        duplicateTitle = "${activeList?.name ?: "Shopping List"} (Copy)"
                        showDuplicationDialog = true
                    }) {
                        Icon(Icons.Default.Copy, contentDescription = "Duplicate", tint = Color(0xFFC084FC))
                    }
                    IconButton(onClick = { showSyncConfigDialog = true }) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings", tint = Color(0xFFC084FC))
                    }
                }

                // Cloud Synchroniztion status bar
                Divider(color = Color(0xFF27272A), thickness = 1.dp)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF09090B))
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(if (viewModel.isSyncEnabled) Color(0xFF22C55E) else Color(0xFFEF4444))
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (viewModel.isSyncEnabled) "Cloud Sync Active" else "Offline-First Mode",
                            fontSize = 11.sp,
                            color = Color(0xFFA1A1AA)
                        )
                    }

                    if (viewModel.isSyncing) {
                        CircularProgressIndicator(
                            color = Color(0xFF9333EA),
                            modifier = Modifier.size(12.dp),
                            strokeWidth = 2.dp
                        )
                    } else if (viewModel.isSyncEnabled) {
                        Text(
                            text = "Refresh",
                            fontSize = 11.sp,
                            color = Color(0xFFC084FC),
                            modifier = Modifier.clickable {
                                viewModel.forceSync()
                                Toast.makeText(context, "Syncing changes...", Toast.LENGTH_SHORT).show()
                            }
                        )
                    }
                }
                Divider(color = Color(0xFF27272A), thickness = 1.dp)
            }
        },
        bottomBar = {
            Column(
                modifier = Modifier
                    .background(Color(0xFF18181B))
                    .padding(bottom = WindowInsets.ime.asPaddingValues().calculateBottomPadding())
            ) {
                // Speech Input Banner
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF1E1B4B))
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .clickable { onScanTrigger() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Mic,
                        contentDescription = "Voice Input",
                        tint = Color(0xFFC084FC),
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Tap to add items with smart Voice AI",
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFFE9D5FF)
                        )
                    )
                }

                Divider(color = Color(0xFF27272A), thickness = 1.dp)

                // Classic text fields manual appending footer
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextField(
                        value = inputItemName,
                        onValueChange = { inputItemName = it },
                        placeholder = { Text("Item name (e.g. Bread)") },
                        modifier = Modifier
                            .weight(0.7f)
                            .clip(RoundedCornerShape(8.dp)),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color(0xFF27272A),
                            unfocusedContainerColor = Color(0xFF27272A),
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            cursorColor = Color(0xFF9333EA)
                        ),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    TextField(
                        value = inputItemQty,
                        onValueChange = { inputItemQty = it },
                        placeholder = { Text("Qty") },
                        modifier = Modifier
                            .weight(0.3f)
                            .clip(RoundedCornerShape(8.dp)),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color(0xFF27272A),
                            unfocusedContainerColor = Color(0xFF27272A),
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            cursorColor = Color(0xFF9333EA)
                        ),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    FloatingActionButton(
                        onClick = {
                            if (inputItemName.isNotBlank()) {
                                viewModel.addItem(inputItemName, inputItemQty)
                                inputItemName = ""
                                inputItemQty = ""
                            }
                        },
                        containerColor = Color(0xFF9333EA),
                        contentColor = Color.White,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Add")
                    }
                }
            }
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .background(Color(0xFF09090B))
        ) {
            val itemsList = activeList?.items ?: emptyList()

            if (itemsList.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        imageVector = Icons.Default.ShoppingCart,
                        contentDescription = "Empty Basket",
                        tint = Color(0xFF404040),
                        modifier = Modifier.size(80.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Nice and Empty!",
                        style = MaterialTheme.typography.headlineSmall.copy(
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Add some grocery items manually above, use the Smart Voice AI triggers helper, or join a shared code!",
                        style = MaterialTheme.typography.bodyMedium.copy(
                            color = Color(0xFFA1A1AA),
                            textAlign = TextAlign.Center
                        )
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(12.dp)
                ) {
                    items(
                        items = itemsList,
                        key = { it.id }
                    ) { item ->
                        ShoppingItemCardView(
                            item = item,
                            onCheckedChange = { viewModel.toggleItemChecked(item.id) },
                            onDelete = { viewModel.deleteItem(item.id) }
                        )
                    }
                }
            }
        }
    }

    // 1. Edit Title dialog
    if (showEditTitleDialog) {
        AlertDialog(
            onDismissRequest = { showEditTitleDialog = false },
            title = { Text("Rename Shopping List") },
            text = {
                TextField(
                    value = editedTitle,
                    onValueChange = { editedTitle = it },
                    singleLine = true
                )
            },
            confirmButton = {
                Button(onClick = {
                    if (editedTitle.isNotBlank()) {
                        viewModel.updateListTitle(editedTitle)
                    }
                    showEditTitleDialog = false
                }) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showEditTitleDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // 2. Duplication dialog
    if (showDuplicationDialog) {
        AlertDialog(
            onDismissRequest = { showDuplicationDialog = false },
            title = { Text("Duplicate Current List") },
            text = {
                Column {
                    Text("Input name for the duplicated copy:", fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    TextField(
                        value = duplicateTitle,
                        onValueChange = { duplicateTitle = it },
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    if (duplicateTitle.isNotBlank()) {
                        viewModel.duplicateActiveList(duplicateTitle)
                    }
                    showDuplicationDialog = false
                }) {
                    Text("Duplicate")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDuplicationDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // 3. QR Sharing Dialog
    if (showShareQrDialog) {
        val listJson = Gson().toJson(activeList)
        val deepLinkUrl = "lin://import?data=${URLEncoder.encode(listJson, "UTF-8")}"
        val qrBitmap = remember(deepLinkUrl) {
            QrCodeUtils.generateQrCode(deepLinkUrl, 512)
        }

        Dialog(onDismissRequest = { showShareQrDialog = false }) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .wrapContentHeight()
                    .padding(24.dp),
                shape = RoundedCornerShape(16.dp),
                color = Color(0xFF27272A)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Scan & Share Link",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            color = Color.White
                        )
                        IconButton(onClick = { showShareQrDialog = false }) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White)
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    qrBitmap?.let {
                        Image(
                            bitmap = it.asImageBitmap(),
                            contentDescription = "QR Code share",
                            modifier = Modifier
                                .size(240.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color.White)
                                .padding(8.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Your friends can scan this QR code instantly from their 'List It Nice' Android apps to import your items!",
                        fontSize = 12.sp,
                        color = Color(0xFFA1A1AA),
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Button(
                        onClick = {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            val clip = ClipData.newPlainText("Deep Link Sharing", deepLinkUrl)
                            clipboard.setPrimaryClip(clip)
                            Toast.makeText(context, "Linkcopied to clipboard!", Toast.LENGTH_SHORT).show()
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9333EA))
                    ) {
                        Text("Copy Sync Deep Link")
                    }
                }
            }
        }
    }

    // 4. Server Sync configuration dialog
    if (showSyncConfigDialog) {
        var serverHostValue by remember { mutableStateOf(viewModel.serverUrl) }
        var isSyncEnabledValue by remember { mutableStateOf(viewModel.isSyncEnabled) }

        AlertDialog(
            onDismissRequest = { showSyncConfigDialog = false },
            title = { Text("Server Sync Settings") },
            text = {
                Column {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Enable Cloud Sync", color = Color.White)
                        Switch(
                            checked = isSyncEnabledValue,
                            onCheckedChange = { isSyncEnabledValue = it }
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Text("Backend Server Endpoints Node Hosting Hostname URL:", fontSize = 12.sp, color = Color(0xFFA1A1AA))
                    Spacer(modifier = Modifier.height(4.dp))
                    TextField(
                        value = serverHostValue,
                        onValueChange = { serverHostValue = it },
                        placeholder = { Text("https://example.com") },
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    viewModel.updateServerConfig(serverHostValue, isSyncEnabledValue)
                    showSyncConfigDialog = false
                    Toast.makeText(context, "Configurations saved!", Toast.LENGTH_SHORT).show()
                }) {
                    Text("Apply")
                }
            },
            dismissButton = {
                TextButton(onClick = { showSyncConfigDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // 5. Recent Lists selector dialog
    if (showRecentListsDialog) {
        Dialog(onDismissRequest = { showRecentListsDialog = false }) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .wrapContentHeight()
                    .padding(18.dp),
                shape = RoundedCornerShape(16.dp),
                color = Color(0xFF18181B)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("My Lists", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = Color.White)
                        IconButton(onClick = { showRecentListsDialog = false }) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White)
                        }
                    }

                    Divider(color = Color(0xFF27272A), thickness = 1.dp, modifier = Modifier.padding(vertical = 12.dp))

                    LazyColumn(modifier = Modifier.heightIn(max = 240.dp)) {
                        items(viewModel.recentLists) { recent ->
                            val isActive = recent.id == activeList?.id
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (isActive) Color(0xFF27272A) else Color.Transparent)
                                    .clickable {
                                        viewModel.selectList(recent.id)
                                        showRecentListsDialog = false
                                    }
                                    .padding(vertical = 10.dp, horizontal = 12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    modifier = Modifier.weight(1f),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.List,
                                        contentDescription = "list",
                                        tint = if (isActive) Color(0xFFC084FC) else Color(0xFFA1A1AA)
                                    )
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Text(
                                        text = recent.name,
                                        color = if (isActive) Color.White else Color(0xFFA1A1AA),
                                        overflow = TextOverflow.Ellipsis,
                                        maxLines = 1
                                    )
                                }
                                if (isActive) {
                                    Icon(Icons.Default.Check, contentDescription = "active", tint = Color(0xFF22C55E))
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Button(
                        onClick = {
                            showRecentListsDialog = false
                            showJoinCodeDialog = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF27272A))
                    ) {
                        Icon(Icons.Default.Search, contentDescription = "Join")
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Sync/Join with 6-Digit Code")
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Button(
                        onClick = {
                            showRecentListsDialog = false
                            showCameraScannerDialog = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF27272A))
                    ) {
                        Icon(Icons.Default.Camera, contentDescription = "Camera")
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Scan QR Code to Import")
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Button(
                        onClick = {
                            viewModel.createNewListLocally("My Shopping List")
                            showRecentListsDialog = false
                            Toast.makeText(context, "New list created!", Toast.LENGTH_SHORT).show()
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9333EA))
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "new")
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Create New List")
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    TextButton(
                        onClick = {
                            viewModel.deleteActiveList()
                            showRecentListsDialog = false
                            Toast.makeText(context, "Active list deleted", Toast.LENGTH_SHORT).show()
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFFEF4444))
                    ) {
                        Icon(Icons.Default.Trash, contentDescription = "Delete")
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Delete Active List")
                    }
                }
            }
        }
    }

    // 6. Join list via standard 6-character code
    if (showJoinCodeDialog) {
        AlertDialog(
            onDismissRequest = { showJoinCodeDialog = false },
            title = { Text("Join Shopping List") },
            text = {
                Column {
                    Text("Input the 6-character sync code (e.g., F8DKS2) to pull and join cooperation details:", fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    TextField(
                        value = customCodeInput,
                        onValueChange = { customCodeInput = it.toUpperCase() },
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    if (customCodeInput.isNotBlank()) {
                        viewModel.selectList(customCodeInput)
                        customCodeInput = ""
                    }
                    showJoinCodeDialog = false
                }) {
                    Text("Sync & Connect")
                }
            },
            dismissButton = {
                TextButton(onClick = { showJoinCodeDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // 7. Live QR Code Scanner view with CameraX & ML Kit
    if (showCameraScannerDialog) {
        val permissionLauncher = rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { isGranted ->
            if (!isGranted) {
                Toast.makeText(context, "Camera permission needed to scan QR!", Toast.LENGTH_LONG).show()
                showCameraScannerDialog = false
            }
        }

        // Auto request camera permission
        LaunchedEffect(Unit) {
            val isCameraGranted = ContextCompat.checkSelfPermission(
                context, Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
            if (!isCameraGranted) {
                permissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }

        Dialog(onDismissRequest = { showCameraScannerDialog = false }) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(380.dp)
                    .padding(8.dp),
                shape = RoundedCornerShape(16.dp),
                color = Color.Black
            ) {
                Column {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Scan Sharing QR Code", color = Color.White, fontWeight = FontWeight.Bold)
                        IconButton(onClick = { showCameraScannerDialog = false }) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White)
                        }
                    }

                    Box(modifier = Modifier.weight(1f)) {
                        CameraQrPreviewView(onQrCodeDetected = { code ->
                            // Attempt to parse deep link "lin://import?data=..."
                            try {
                                if (code.startsWith("lin://import?data=") || code.startsWith("web+lin://import?data=")) {
                                    val matches = code.split("data=")
                                    if (matches.size > 1) {
                                        val payload = URLDecoder.decode(matches[1], "UTF-8")
                                        pendingPayload.value = payload
                                        showCameraScannerDialog = false
                                    }
                                } else {
                                    // Raw code
                                    viewModel.selectList(code)
                                    showCameraScannerDialog = false
                                    Toast.makeText(context, "Loaded list code: $code", Toast.LENGTH_SHORT).show()
                                }
                            } catch (e: Exception) {
                                Toast.makeText(context, "Error decoding QR data", Toast.LENGTH_SHORT).show()
                            }
                        })
                    }
                }
            }
        }
    }
}

@Composable
fun ShoppingItemCardView(
    item: ShoppingItem,
    onCheckedChange: (Boolean) -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF18181B)
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(
                checked = item.checked,
                onCheckedChange = onCheckedChange,
                colors = CheckboxDefaults.colors(
                    checkedColor = Color(0xFF9333EA),
                    uncheckedColor = Color(0xFF404040)
                )
            )

            Spacer(modifier = Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.bodyLarge.copy(
                        color = if (item.checked) Color(0xFFA1A1AA) else Color.White,
                        textDecoration = if (item.checked) TextDecoration.LineThrough else TextDecoration.None,
                        fontWeight = FontWeight.Medium
                    )
                )
                if (item.quantity.isNotBlank()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xFF27272A))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = item.quantity,
                            fontSize = 11.sp,
                            color = Color(0xFFC084FC),
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            IconButton(onClick = onDelete) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = "Delete item",
                    tint = Color(0xFFEF4444)
                )
            }
        }
    }
}

@Composable
fun CameraQrPreviewView(onQrCodeDetected: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }

    AndroidView(
        factory = { ctx ->
            val previewView = PreviewView(ctx)
            val executor = ContextCompat.getMainExecutor(ctx)

            cameraProviderFuture.addListener({
                val cameraProvider = cameraProviderFuture.get()
                val preview = Preview.Builder().build().apply {
                    setSurfaceProvider(previewView.surfaceProvider)
                }

                val imageAnalysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()

                val scanner = BarcodeScanning.getClient()

                imageAnalysis.setAnalyzer(executor) { imageProxy ->
                    val mediaImage = imageProxy.image
                    if (mediaImage != null) {
                        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                        scanner.process(image)
                            .addOnSuccessListener { barcodes ->
                                val barcode = barcodes.firstOrNull()
                                barcode?.rawValue?.let { rawResult ->
                                    onQrCodeDetected(rawResult)
                                }
                            }
                            .addOnCompleteListener {
                                imageProxy.close()
                            }
                    } else {
                        imageProxy.close()
                    }
                }

                val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
                try {
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        cameraSelector,
                        preview,
                        imageAnalysis
                    )
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }, executor)
            previewView
        },
        modifier = Modifier.fillMaxSize()
    )
}
