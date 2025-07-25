#!/bin/bash

# Define the branch to pull updates from (default is "main")
BRANCH=${1:-master}

echo "Updating to match the latest commits on branch: $BRANCH"

# Ensure we are in the repository's root directory
cd "$(git rev-parse --show-toplevel)" || exit 1

# Stash any uncommitted changes (if applicable)
git reset --hard
echo "All uncommitted changes have been discarded."

# Remove untracked files and directories
git clean -fd
echo "All untracked files and directories have been removed."

# Fetch the latest changes from the remote repository
git fetch origin
echo "Fetched the latest changes from the remote repository."

# Reset the local branch to match the remote branch
git reset --hard origin/$BRANCH
echo "Local branch reset to match origin/$BRANCH."

# Optional: Pull the latest changes (in case there are tags or similar updates)
git pull origin $BRANCH --ff-only
echo "Repository is now up to date."

echo "Update complete."
