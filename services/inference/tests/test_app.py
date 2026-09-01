"""Tests for Modal App, Images, and Volumes (P3 U1)."""

import modal
from sightforge_inference.app import (
    VOLUME_MOUNTS,
    app,
    cpu_image,
    frames_volume,
    gpu_image,
    inference_secrets,
    weights_volume,
)
from sightforge_inference.config import (
    FRAMES_MOUNT_PATH,
    WEIGHTS_MOUNT_PATH,
)


def test_app_initialization() -> None:
    """Verifies that the Modal App is correctly initialized with the expected name."""
    assert isinstance(app, modal.App)
    assert app.name == "sightforge-inference"


def test_volumes_configuration() -> None:
    """Verifies that weights and frames volumes are correctly configured."""
    assert isinstance(weights_volume, modal.Volume)
    assert isinstance(frames_volume, modal.Volume)
    assert WEIGHTS_MOUNT_PATH in VOLUME_MOUNTS
    assert FRAMES_MOUNT_PATH in VOLUME_MOUNTS


def test_secrets_declaration() -> None:
    """Verifies that inference secrets are declared with required keys."""
    assert isinstance(inference_secrets, modal.Secret)


def test_images_configuration() -> None:
    """Verifies that specialized CPU and GPU container images are defined."""
    assert isinstance(cpu_image, modal.Image)
    assert isinstance(gpu_image, modal.Image)
