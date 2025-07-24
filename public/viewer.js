let pastedImageUrl = ""; // If there is an image pasted, this will hold the URL
let uploadedFileType = null; // 'pdf' or 'image'
let uploadedImagesCount = 0;
const MAX_IMAGES = 4;
let selectedFiles = []; // Accumulate multiple photo captures across separate camera invocations

const dropZone = document.getElementById("imagePasteZone");
if (dropZone) dropZone.focus(); // Ensure dropZone is focusable on load for paste

const inputFile = document.getElementById("inputFile"); // If the user uploads a file, this retrieves its value
if (inputFile) {
  inputFile.addEventListener("change", function () {
    const files = Array.from(this.files);
    selectedFiles.push(...files); // ✅ accumulate all newly selected files
    const preview = document.getElementById("previewContainer");
    const statusMsg = document.getElementById("fileUploadStatus");
    const labelSpan = document.getElementById("uploadFileLabel");
    if (statusMsg) statusMsg.textContent = "";

    for (const file of files) {
      if (uploadedFileType === 'pdf') {
        if (statusMsg) statusMsg.textContent = "You can only upload one PDF file at a time.";
        return;
      }
      if (uploadedFileType === 'image' && file.type === 'application/pdf') {
        if (statusMsg) statusMsg.textContent = "You can’t mix images and PDFs.";
        return;
      }
      if (uploadedFileType === null) {
        uploadedFileType = file.type === 'application/pdf' ? 'pdf' : 'image';
      }

      if (file.type.startsWith("image/")) {
        if (uploadedImagesCount >= MAX_IMAGES) {
          if (statusMsg) statusMsg.textContent = "You’ve reached the maximum number of photos to upload.";
          const uploadLabel = document.querySelector('label[for="inputFile"]');
          if (uploadLabel) {
            uploadLabel.removeAttribute('for');
            uploadLabel.style.pointerEvents = 'none';
            uploadLabel.style.color = 'gray';
            uploadLabel.style.textDecoration = 'none';
          }
          return;
        }
        uploadedImagesCount++;
        const reader = new FileReader();
        reader.onload = function (e) {
          // Create container div for image and remove button
          const container = document.createElement("div");
          container.style.position = "relative";
          container.style.display = "inline-block";
          container.style.margin = "5px";

          const img = document.createElement("img");
          img.src = e.target.result;
          img.style.maxWidth = "150px";
          img.style.maxHeight = "150px";

          const removeBtn = document.createElement("button");
          removeBtn.textContent = "×";
          removeBtn.style.position = "absolute";
          removeBtn.style.top = "0";
          removeBtn.style.right = "0";
          removeBtn.style.background = "rgba(0,0,0,0.5)";
          removeBtn.style.color = "white";
          removeBtn.style.border = "none";
          removeBtn.style.cursor = "pointer";

          removeBtn.addEventListener("click", () => {
            preview.removeChild(container);
            uploadedImagesCount--;
            if (uploadedImagesCount < MAX_IMAGES) {
              if (labelSpan) labelSpan.textContent = uploadedImagesCount > 0 ? "Upload or Take Another Photo" : "Upload or Take Photo";
              const uploadLabel = document.querySelector('label');
              if (uploadLabel && !uploadLabel.hasAttribute('for')) {
                uploadLabel.setAttribute('for', 'inputFile');
                uploadLabel.style.pointerEvents = 'auto';
                uploadLabel.style.color = 'blue';
                uploadLabel.style.textDecoration = 'underline';
              }
            }
          });

          container.appendChild(img);
          container.appendChild(removeBtn);
          preview.appendChild(container);
        };
        reader.readAsDataURL(file);
      } else if (file.type === "application/pdf") {
        const p = document.createElement("p");
        p.textContent = `Selected PDF: ${file.name}`;
        preview.appendChild(p);
        if (labelSpan && labelSpan.parentElement) {
          labelSpan.parentElement.style.display = 'none';
        }
      } else {
        if (statusMsg) statusMsg.textContent = "Unsupported file type.";
      }
    }
    // Update label after processing files
    if (uploadedFileType === 'image') {
      if (labelSpan && labelSpan.parentElement) {
        labelSpan.parentElement.style.display = '';
      }
      if (uploadedImagesCount < MAX_IMAGES) {
        if (labelSpan) labelSpan.textContent = uploadedImagesCount > 0 ? "Upload or Take Another Photo" : "Upload or Take Photo";
      } else if (uploadedImagesCount >= MAX_IMAGES) {
        if (labelSpan) labelSpan.textContent = "You’ve reached the maximum number of photos to upload.";
        const uploadLabel = document.querySelector('label[for="inputFile"]');
        if (uploadLabel) {
          uploadLabel.removeAttribute('for');
          uploadLabel.style.pointerEvents = 'none';
          uploadLabel.style.color = 'gray';
          uploadLabel.style.textDecoration = 'none';
        }
      }
    }
  });
}

// This handles the form upload submission
// It gathers the input based on the active tab (URL, file, or text),
// and submits it to the server via a POST request to the /webhook endpoint.
// It also handles image uploads and pastes, displaying the image in the drop zone.
// If the upload is successful, it reloads the page to show the new recipe.
// If there is an error, it displays the error message in the status area.
// The status area shows a spinner while the upload is in progress and updates with success or error
// messages after the upload completes.
document.getElementById("uploadForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData();

  const { type, value } = getActiveInput();

  if (!value) {
    alert("Please enter a URL, upload a file, or paste recipe text.");
    return;
  }

  if (type === "url") formData.append("input", value);
  if (type === "file") {
    selectedFiles.forEach(file => formData.append("filename", file));
  }
  if (type === "text") {
    let textInput = value;
    if (pastedImageUrl) {
      textInput = `Use this value for ogImageUrl: ${pastedImageUrl}\n\n${textInput}`;
    }
    formData.append("input", textInput);
  }

  const status = document.getElementById("uploadStatus");
  status.textContent = "Submitting...";
  status.className = "";
  document.getElementById("spinner").style.display = "inline-block";

  try {
    const result = await fetch("/webhook", {
      method: "POST",
      body: formData
    });

    const json = await result.json();
    if (json.viewer) {
      status.innerHTML = `✅ Recipe queued. Reloading...`; 
      status.className = "success";
      setTimeout(() => window.location.reload(), 1000); 
    } else {
      throw new Error(json.error || "Unknown error");
    }
  } catch (err) {
    status.textContent = `❌ Error: ${err.message}`;
    status.className = "error";
  }
  finally {
    document.getElementById("spinner").style.display = "none";
  }
});

// Handle tab switching for URL, file, and text inputs
document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', () => {
    // Remove active class from all tabs
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    // Hide all tab content
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');

    // Show selected tab
    const selected = button.getAttribute('data-tab');
    document.getElementById(`tab-${selected}`).style.display = 'block';
    if (selected === 'text') {
      const dz = document.getElementById('imagePasteZone');
      if (dz) dz.focus();
    }
  });
});

// Based on which tab is active, get the input value
// This function retrieves the input value based on the active tab (URL, file, or text).
// It returns an object with the type of input and its value.
function getActiveInput() {
  const activeTab = document.querySelector('.tab-button.active').getAttribute('data-tab');
  if (activeTab === 'url') return { type: 'url', value: document.getElementById('inputUrl').value };
  if (activeTab === 'file') {
    const files = Array.from(document.getElementById('inputFile').files);
    return { type: 'file', value: files };
  }
  if (activeTab === 'text') return { type: 'text', value: document.getElementById('inputText').value };
}

// Handle image pasting in the drop zone
async function handleImage(file) {
  const formData = new FormData();
  formData.append("ogImageUpload", file);

  try {
    const response = await fetch("/upload-image", {
      method: "POST",
      body: formData
    });

    const result = await response.json();
    if (!result.url) throw new Error("Image upload failed");

    pastedImageUrl = result.url;

    dropZone.innerHTML = "";
    const img = document.createElement("img");
    img.src = result.url;
    img.style.maxWidth = "300px";
    img.style.maxHeight = "200px";
    dropZone.appendChild(img);
  } catch (err) {
    console.error("Image upload error:", err);
    dropZone.textContent = "❌ Failed to upload image";
  }
}

// Prevent image pasting anywhere from inserting image blobs as DOM elements,
// except allow pasting in the drop zone.
document.addEventListener("paste", (e) => {
  const dropZone = document.getElementById("imagePasteZone");
  if (dropZone && dropZone.contains(document.activeElement)) {
    // Handle image paste in drop zone
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault(); // Prevent default paste behavior
            handleImage(file);
            return;
          }
        }
      }
    }
    return;
  }

  // Prevent pasting images in other areas
  // This will stop images from being pasted into text inputs or other elements
  const hasImage = Array.from(e.clipboardData?.items || []).some(item =>
    item.type.startsWith("image/")
  );
  if (hasImage) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);
