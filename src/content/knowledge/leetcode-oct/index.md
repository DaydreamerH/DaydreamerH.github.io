---
title: "Leetcode-Oct"
description: ""
date: "2024-10-23 10:54:26"
category: "C++ 基础"
originalCategory: "C++ 基础"
track: "Programming Foundation"
level: foundation
status: draft
published: false
minutes: 5
order: 1000
prerequisites: []
tags: ["C++"]
source: "_posts"
---
## 2024.10.23 构成整天的下标对数目 II
给你一个整数数组 hours，表示以 小时 为单位的时间，返回一个整数，表示满足 i < j 且 hours[i] + hours[j] 构成 整天 的下标对 i, j 的数目。

整天 定义为时间持续时间是 24 小时的 整数倍 。

例如，1 天是 24 小时，2 天是 48 小时，3 天是 72 小时，以此类推。

暴力算法（超时）：
```
class Solution {
public:
    long long countCompleteDayPairs(vector<int>& hours) {
        long long count = 0;
        for(int i=0;i<hours.size();i++)
        {
            for(int j=i+1;j<hours.size();j++)
            {
                if((hours[i]+hours[j])%24==0)
                {
                    count++;
                }
            }
        }
        return count;
    }
};
```
hours[i]与hours[j]需要满足$hours[i]+hours[j]=24\times n$，但实际上只需要hours[i]与hours[j]的余数之和为24的整除数即可。

因此我们可以便利数组hours，获取余数为0至23的各自出现次数，除了0，12以外两两匹配。余数为0或12时，与自己匹配。

```
class Solution {
public:
    long long countCompleteDayPairs(vector<int>& hours) {
        long long count = 0;
        unordered_map<int, int> mp;
        for(const auto hour:hours)
        {
            if(hour%24==0)mp[0]++;
            else mp[hour%24]++;
        }
        if(mp[0]>1)
            count += (long long)mp[0]*(mp[0]-1)/2;
        for(int i = 1;i<12;i++)
            count += mp[i]*mp[24-i];
        if(mp[12]>1)
            count += (long long)mp[12]*(mp[12]-1)/2;

        return count;
    }
};
```

而官方题解，一边维护对数，一边维护余数出现次数。
```
class Solution {
public:
    long long countCompleteDayPairs(vector<int>& hours) {
        long long ans = 0;
        vector<int> cnt(24);
        for (int hour : hours) {
            ans += cnt[(24 - hour % 24) % 24];
            cnt[hour % 24]++;
        }
        return ans;
    }
};
```
## 2024.10.24 找到连续赢 K 场比赛的第一位玩家
有 n 位玩家在进行比赛，玩家编号依次为 0 到 n - 1 。

给你一个长度为 n 的整数数组 skills 和一个 正 整数 k ，其中 skills[i] 是第 i 位玩家的技能等级。skills 中所有整数 互不相同 。

所有玩家从编号 0 到 n - 1 排成一列。

比赛进行方式如下：

队列中最前面两名玩家进行一场比赛，技能等级 更高 的玩家胜出。
比赛后，获胜者保持在队列的开头，而失败者排到队列的末尾。
这个比赛的赢家是 第一位连续 赢下 k 场比赛的玩家。

请你返回这个比赛的赢家编号。

暴力算法（超时）：
```
class Solution {
public:
    void combat(vector<int>& skills)
    {
        if(skills[0]>skills[1])
        {
            int temp = skills[1];
            skills.erase(skills.begin()+1);
            skills.push_back(temp);
        }
        else
        {
            int temp = skills[0];
            skills.erase(skills.begin());
            skills.push_back(temp);
        }
    }
    int findWinningPlayer(vector<int>& skills, int k) {
        int winner = 0;
        int count = 0;
        unordered_map<int, int>mp;
        for(int i=0;i<skills.size();i++)
            mp[skills[i]] = i;
        while(count<k)
        {
            combat(skills);
            if(winner!=skills[0])
            {
                winner = skills[0];
                count = 1;
            }
            else count++;
        }
        return mp[skills[0]];
    }
};
```

后来我意识到，其实只要元素在其后k位中最大，就满足胜利条件。于是开始寻找k+1个元素为一组的最大值，直到最大值与这组里第一个元素相同，否则更新数组顺序，并以此次最大值为下一组元素的开头，并在第二次比较时把k-1.

但之后我又想到，其实根本没必要更新顺序，每一组的失败都意味着后面的值更高，当k比剩余的元素数量还大是，找到最大值就可以了。于是放弃更新顺序，并比较k和剩余元素数量，如果k较大，则查找最大值即可。

```
class Solution {
public:
    int findWinningPlayer(vector<int>& skills, int k) {
        if(k>=skills.size())
            return max_element(skills.begin(), skills.end()) - skills.begin();
        unordered_map<int, int> mp;
        for(int i =0;i<skills.size();i++)
            mp[skills[i]] = i;

        auto iter = skills.begin();
        auto max_iter = max_element(iter, iter+k+1);
        if(max_iter == iter)return mp[*iter];
        iter =  max_iter;
        --k;

        while(iter!=skills.end())
        {
            if(skills.end() - iter<=k)
                return max_element(iter, skills.end()) - skills.begin();

            auto max_iter = max_element(iter, iter+k+1);

            if(max_iter == iter)return mp[*iter];

            iter =  max_iter;
        }
        return -1;
    }
};
```

但我忽略了由于我没有更新数组顺序，所以序号无需存储在map里，消耗了额外的时间和空间。

于是我把代码更新如下（超越了100%）：
```
class Solution {
public:
    int findWinningPlayer(vector<int>& skills, int k) {
        if(k>=skills.size())
            return max_element(skills.begin(), skills.end()) - skills.begin();
        int last_i = 0;
        auto iter = skills.begin();
        auto max_iter = max_element(iter, iter+k+1);
        if(max_iter == iter)return last_i;
        iter =  max_iter;
        --k;
        last_i = max_iter - skills.begin();
        while(iter!=skills.end())
        {
            if(skills.end() - iter<=k)
                return max_element(iter, skills.end()) - skills.begin();

            auto max_iter = max_element(iter, iter+k+1);

            if(max_iter == iter)return last_i;

            iter =  max_iter;
            last_i = max_iter - skills.begin();
        }
        return last_i;
    }
};
```

官方题解如下：
```
class Solution {
public:
    int findWinningPlayer(vector<int>& skills, int k) {
        int n = skills.size();
        int cnt = 0;
        int i = 0, last_i = 0;
        while (i < n) {
            int j = i + 1;
            while (j < n && skills[j] < skills[i] && cnt < k) {
                j++;
                cnt++;
            }
            if (cnt == k) {
                return i;
            }
            cnt = 1;
            last_i = i;
            i = j;
        }
        return last_i;
    }
};
```
## 2024.10.25 执行操作可获得的最大总奖励 I
给你一个整数数组 rewardValues，长度为 n，代表奖励的值。

最初，你的总奖励 x 为 0，所有下标都是 未标记 的。你可以执行以下操作 任意次 ：

从区间 [0, n - 1] 中选择一个 未标记 的下标 i。
如果 rewardValues[i] 大于 你当前的总奖励 x，则将 rewardValues[i] 加到 x 上（即 x = x + rewardValues[i]），并 标记 下标 i。
以整数形式返回执行最优操作能够获得的 最大 总奖励。

这是一道动态规划题目。

首先我们考虑每一步的操作，假设下一次要加的数为$x$，那么上一步得到的总的reward不会超过$x-1$，那么这一步相加后的总值不会超过$2x-1$. 那么对于待加的数$x$，操作后的总价值范围为$[x, 2x-1]$.

对于一个序列而言，总的最大奖励就是每个x作为最后一个操作数最大奖励中的最大值。我们对序列进行排序，按从小到大排序，序列中最大的值为$m$，那么这个序列能获得最大奖励为$2m-1$.

创建向量`dp`，其序号表示奖励，其值为1时表示该奖励可被获取，其值为0时，表示该奖励不可获取。`dp[0]=1`表示不进行任何操作，奖励为0.

对于代操作数$x$，加上它得到的奖励$k$的范围是$[x, 2x-1]$. $k$的取值范围包含了之前的奖励小于$x$的隐藏信息。

`dp[k]=1`的条件是，`dp[k-x]=1`，这说明了之前的总奖励为$k-x$，加上这次的$x$就可以得到$k$.

为了避免出现重复相加同一位置的数，在遍历$k$时，要从大到小遍历。

```
class Solution {
public:
    int maxTotalReward(vector<int>& rewardValues) {
        sort(rewardValues.begin(), rewardValues.end());
        int m = rewardValues.back();
        vector<int> dp(2*m);
        dp[0] = 1;
        for(auto v:rewardValues)
        {
            for(int k=2*v-1;k>=v;--k)
            {
                if(dp[k-v])
                    dp[k] = 1;
            }
        }
        int ans;
        for(int i=0;i<dp.size();i++)
            if(dp[i])ans = i;
        return ans;
    }
};
```

## 2024.10.26 执行操作可获得的最大总奖励 II
题目内容与昨天一致，但要求时间复杂度更小。


用位运算优化。
```
class Solution {
public:
    int maxTotalReward(vector<int>& rewardValues) {
        int max = *max_element(rewardValues.begin(), rewardValues.end());
        sort(rewardValues.begin(), rewardValues.end());
        bitset<100000>f0, f1;
        f1[0]=1;
        for(int i=0,j=0;i<rewardValues.size();i++)
        {
            while(j<rewardValues[i])
            {
                f0[j] = f1[j];
                j++;
            }
            f1 |= (f0<<rewardValues[i]);
        }

        int result = 0;

        for(int i=0;i<f1.size();i++)
        {
            if(f1[i])result = i;
        }

        return result;
    }
};
```
其中`f0`是`f1`的副本，在进行位移前，首先将`f0`复制到`f1`去，`j<rewardValues[i]`的限制来源于待操作数会比之前的奖励综合的值更大。

复制后，将`f0`左移`rewardValues[i]`位，新诞生的奖励总值对应的位将变为1. 但同时这破坏了原有的奖励总值的记录，所以在这里使用或操作，将新旧记录合并。
