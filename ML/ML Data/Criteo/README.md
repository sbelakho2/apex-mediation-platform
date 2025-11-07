---
license: cc-by-nc-sa-4.0
task_categories:
- text-classification
tags:
- click
- advertising
- commerce
size_categories:
- n>1T
---

# 📊 Criteo 1TB Click Logs Dataset

This dataset contains **feature values and click feedback** for millions of display ads. Its primary purpose is to **benchmark algorithms for clickthrough rate (CTR) prediction**.

It is similar, but larger than the dataset released for the Display Advertising Challenge hosted by Kaggle:  
🔗 [Kaggle Criteo Display Advertising Challenge](https://www.kaggle.com/c/criteo-display-ad-challenge)


## 📁 Full Description

This dataset contains **24 files**, each corresponding to **one day of data**.

### 🏗️ Dataset Construction

- The training data spans **24 days** of Criteo traffic.
- Each row represents a **display ad** served by Criteo.
- The **first column** indicates whether the ad was **clicked (1)** or **not clicked (0)**.
- Both **positive (clicked)** and **negative (non-clicked)** examples have been **subsampled**, though at **different rates** to keep business confidentiality.

## 🧱 Features

- **13 integer features**  
  Mostly count-based; represent numerical properties of the ad, user, or context.
  
- **26 categorical features**  
  Values are **hashed into 32-bit integers** for anonymization.  
  The **semantic meaning** of these features is **undisclosed**.

> ⚠️ Some features may contain **missing values**.


## 🧾 Data Format

- Rows are **chronologically ordered**
- Columns are **tab-separated** and follow this schema:
  > `<label> <int_feature_1> ... <int_feature_13> <cat_feature_1> ... <cat_feature_26>`
- If a value is missing, the field is simply **left empty**.


## 🔄 Differences from Kaggle Challenge Dataset

- 📅 The data covers a **different time period**
- 🔄 **Subsampling ratios** differ
- 🔢 **Ordering of features** is different
- 🧮 Some features have **different computation methods**
- 🔐 **Hash function** for categorical features has changed